export default {
  es: `
          <p>Cuando ejecutas <code>docker run nginx</code>, la petición pasa por varias capas de software antes de llegar al kernel. Entender estas capas es fundamental para diagnosticar problemas, configurar seguridad y razonar sobre el comportamiento en producción.</p>

          <h2>La arquitectura: Docker → containerd → runc</h2>

          <pre><code>docker run nginx
    │
    ▼
dockerd          ← El daemon de Docker. Gestiona la API, imágenes, redes, volúmenes.
    │  gRPC
    ▼
containerd       ← El container runtime de alto nivel. Gestiona el ciclo de vida.
    │  ttRPC (spawn inicial del shim vía fork+exec)
    ▼
containerd-shim  ← Un proceso intermediario — uno por contenedor con Docker,
    │            uno por Pod con CRI/Kubernetes (agrupa por sandbox-id).
    │  fork+exec (una vez por cada runc create / start / delete)
    ▼
runc             ← El runtime OCI de bajo nivel. Crea el contenedor y sale.
    │  syscalls
    ▼
kernel           ← clone3(), mount(), pivot_root(), capset(), seccomp(), execve()...</code></pre>

          <p><a href="https://github.com/opencontainers/runc" target="_blank" rel="noopener"><code>runc</code></a> es el que realmente toca el kernel. Una vez que el contenedor está corriendo, <code>runc</code> sale — el contenedor sigue vivo bajo <a href="https://github.com/containerd/containerd/blob/main/docs/runtime-v2.md" target="_blank" rel="noopener"><code>containerd-shim</code></a>.</p>

          <p>El <a href="https://github.com/containerd/containerd/tree/main/core/runtime/v2" target="_blank" rel="noopener">containerd-shim</a> existe por tres razones concretas:</p>

          <ol type="a">
            <li><strong>Canaliza <code>stdout</code> y <code>stderr</code> del contenedor.</strong> Según la <a href="https://github.com/containerd/containerd/blob/main/docs/runtime-v2.md" target="_blank" rel="noopener">doc oficial</a>: <em>"I/O for a container is provided by the client to the shim via fifo on Linux, named pipes on Windows, or log files on disk."</em> El shim es quien mantiene esos descriptores abiertos, así que <code>docker logs</code> y <code>kubectl logs</code> siguen funcionando aunque <code>runc</code> ya haya salido.</li>

            <li><strong>Sobrevive al reinicio de <code>containerd</code>.</strong> El shim corre como proceso independiente con su propio socket ttRPC; si <code>containerd</code> se reinicia, la doc dice explícitamente: <em>"when containerd boots and reconnects to shims. If a bundle is still on disk but containerd cannot connect to a shim, the delete command is invoked."</em> Es decir, los contenedores siguen corriendo y <code>containerd</code> se reconecta al shim al levantar — solo invoca el cleanup si el shim se perdió.</li>

            <li><strong>Actúa como <em>sub-reaper</em> del PID 1 del contenedor.</strong> Cita literal de la doc: <em>"The shim process takes responsibility as a sub-reaper to cleanup exited containers or setns(2) processes."</em> Cuando el proceso del contenedor termina, el shim lo adopta, lo cosecha con <code>wait()</code> y reporta el exit code a <code>containerd</code> por ttRPC.</li>
          </ol>

          <h2>El bundle OCI</h2>

          <p>El estándar <a href="https://opencontainers.org/" target="_blank" rel="noopener">OCI (Open Container Initiative)</a> define un formato de bundle en su <a href="https://github.com/opencontainers/runtime-spec/blob/main/bundle.md" target="_blank" rel="noopener">runtime-spec</a>: un directorio con dos elementos:</p>

          <pre><code>/bundle/
├── config.json   ← Especificación completa del contenedor
└── rootfs/       ← El filesystem raíz</code></pre>

          <p>El <a href="https://github.com/opencontainers/runtime-spec/blob/main/config.md" target="_blank" rel="noopener"><code>config.json</code></a> describe todo: qué <a href="/tutorial/que-es-realmente-un-contenedor/namespaces">namespaces</a> crear, qué <a href="/tutorial/que-es-realmente-un-contenedor/capabilities">capabilities</a> tener, los mounts, las variables de entorno, el entrypoint, los <a href="/tutorial/que-es-realmente-un-contenedor/cgroups">cgroups</a>, las reglas de seccomp. Es exactamente la misma información que pasabas vía flags de <code>unshare</code> al <a href="/tutorial/que-es-realmente-un-contenedor/construyendo-un-contenedor">construir un contenedor a mano</a>, ahora empaquetada como JSON.</p>

          <pre><code>mkdir /tmp/bundle && cd /tmp/bundle
docker export $(docker create nginx) | tar -xC rootfs/
runc spec  # Genera un config.json por defecto

# Inspeccionar lo que generó
cat config.json | jq '.process.capabilities'
cat config.json | jq '.linux.namespaces'</code></pre>

          <h2>La secuencia exacta de runc</h2>

          <p>Al ejecutar <code>runc run</code>, el proceso realiza en orden:</p>

          <ol>
            <li><strong>Validar</strong> el bundle OCI (<code>config.json</code> + <code>rootfs/</code>).</li>
            <li><strong>Crear el cgroup</strong> en <code>/sys/fs/cgroup/</code> con los <a href="/tutorial/que-es-realmente-un-contenedor/cgroups">límites</a> especificados, y escribir su propio PID a <code>cgroup.procs</code> para que el futuro clone herede el cgroup.</li>
            <li><strong>Llamar a <a href="https://man7.org/linux/man-pages/man2/clone.2.html" target="_blank" rel="noopener"><code>clone3()</code></a></strong> con los flags de namespace: <code>CLONE_NEWPID | CLONE_NEWNET | CLONE_NEWNS | CLONE_NEWUTS | CLONE_NEWIPC | CLONE_NEWCGROUP</code>, y opcionalmente <code>CLONE_NEWUSER</code> si el <code>config.json</code> declara un user namespace. Son los ocho <a href="/tutorial/que-es-realmente-un-contenedor/namespaces">tipos</a> menos <code>time</code>, que runc no toca por default.</li>
            <li>El proceso hijo, ya dentro de los namespaces nuevos, hace <code>mount --make-rprivate /</code> para evitar que los mounts se propaguen al host. Sin esto, <a href="/tutorial/que-es-realmente-un-contenedor/chroot-pivot-root"><code>pivot_root</code></a> falla con <code>EINVAL</code>.</li>
            <li>Configura los mounts del <code>config.json</code>: bind mounts, <code>/proc</code>, <code>/dev</code>, <code>/sys</code>.</li>
            <li><strong><a href="https://man7.org/linux/man-pages/man2/pivot_root.2.html" target="_blank" rel="noopener"><code>pivot_root</code></a></strong> al rootfs del contenedor, seguido de <code>umount -l</code> del viejo root — así desaparece la tabla de montajes del host del namespace.</li>
            <li><strong>Aplicar <a href="/tutorial/que-es-realmente-un-contenedor/capabilities">capabilities</a></strong> vía <a href="https://man7.org/linux/man-pages/man2/capset.2.html" target="_blank" rel="noopener"><code>capset()</code></a> y <code>prctl(PR_CAPBSET_DROP, ...)</code>: reduce el bounding set al conjunto declarado en el <code>config.json</code>.</li>
            <li><strong>Aplicar el perfil de seccomp</strong> vía la syscall <a href="https://man7.org/linux/man-pages/man2/seccomp.2.html" target="_blank" rel="noopener"><code>seccomp(SECCOMP_SET_MODE_FILTER, ...)</code></a> (el antiguo <code>prctl(PR_SET_SECCOMP)</code> sigue funcionando como fallback, pero la syscall dedicada es la API moderna desde kernel 3.17).</li>
            <li><strong><code>execve()</code></strong> del entrypoint definido en <code>config.json</code>.</li>
            <li><code>runc</code> sale. El proceso del contenedor queda bajo <code>containerd-shim</code>, con el cgroup, los namespaces y las capabilities aplicadas.</li>
          </ol>

          <h2>Verificando cada paso en vivo</h2>

          <pre><code># Usar strace para ver las syscalls que hace runc.
# IMPORTANTE: en kernels modernos (y con glibc reciente) runc usa clone3,
# no clone. Hay que pedir ambos explícitamente, o usar el alias %process
# que cubre clone/clone3/fork/vfork/execve de una vez.
sudo strace -f -e trace=%process,unshare,pivot_root,mount \\
  runc run --bundle /tmp/bundle mi-contenedor 2>&1 | head -50</code></pre>

          <pre><code># Clonar el proceso con los namespace flags (clone3 en kernels ≥ 5.3)
clone3({flags=CLONE_NEWPID|CLONE_NEWNET|CLONE_NEWNS|
              CLONE_NEWUTS|CLONE_NEWIPC|CLONE_NEWCGROUP,
        exit_signal=SIGCHLD,
        stack=..., stack_size=...}, size=88) = 12345

# Hacer la propagación privada (por eso el bind mount siguiente no se propaga al host)
mount("none", "/", NULL, MS_REC|MS_PRIVATE, NULL)

# Montar el rootfs
mount("/tmp/bundle/rootfs", "/tmp/bundle/rootfs", NULL, MS_BIND|MS_REC, NULL)

# pivot_root
pivot_root(".", ".old_root")

# Montar /proc dentro del contenedor
mount("proc", "/proc", "proc", MS_NOSUID|MS_NODEV|MS_NOEXEC, NULL)

# Ejecutar el entrypoint
execve("/docker-entrypoint.sh", ["/docker-entrypoint.sh", "nginx", "-g", "daemon off;"], ...)</code></pre>

          <h2>containerd vs Docker: la distinción que importa</h2>

          <p>Kubernetes no usa Docker. Usa <strong>containerd</strong> directamente (o CRI-O) a través de la <a href="https://kubernetes.io/docs/concepts/architecture/cri/" target="_blank" rel="noopener">Container Runtime Interface (CRI)</a>. Docker es solo una capa de conveniencia encima de containerd para uso en desarrollo. En producción con Kubernetes:</p>

          <pre><code>kubelet → CRI → containerd → runc → kernel</code></pre>

          <p>El flujo es más corto y el resultado es idéntico. Cuando Kubernetes crea un Pod, <code>kubelet</code> le pide a <code>containerd</code> que cree los contenedores especificados. <code>containerd</code> llama a <code>runc</code> por cada uno. <code>runc</code> aplica los mismos pasos que describimos arriba — los mismos que tú aplicaste a mano en el <a href="/tutorial/que-es-realmente-un-contenedor/construyendo-un-contenedor">paso 7 del capítulo anterior</a>.</p>

          <h2>Runtimes alternativos</h2>

          <p><a href="https://github.com/opencontainers/runc" target="_blank" rel="noopener"><code>runc</code></a> es la referencia OCI — escrito en Go, usa los namespaces del host directamente, es el caso general. Cuando necesitas otras garantías, hay alternativas con el mismo interface OCI:</p>

          <p><a href="https://github.com/containers/crun" target="_blank" rel="noopener"><strong><code>crun</code></strong></a> es un drop-in replacement escrito en C. Mismo <code>config.json</code>, mismos namespaces, pero arranca significativamente más rápido y usa menos memoria — útil cuando corres cientos de contenedores por nodo. Es el runtime default de Podman.</p>

          <p><a href="https://github.com/containers/youki" target="_blank" rel="noopener"><strong><code>youki</code></strong></a> es un runtime OCI moderno escrito en Rust. Mismo perfil que runc pero con las garantías de memory safety de Rust; interesante como experimento de ingeniería y adoptado cada vez más en producción.</p>

          <p><a href="https://gvisor.dev/" target="_blank" rel="noopener"><strong><code>gVisor</code> (<code>runsc</code>)</strong></a> tiene un enfoque distinto: en vez de dejar que el contenedor use las syscalls del kernel del host, las intercepta y las ejecuta en un <em>kernel en espacio de usuario</em> (Sentry). El aislamiento es mucho mayor — una vulnerabilidad del kernel del host es inalcanzable desde dentro — a cambio de overhead por cada syscall. Apropiado para multi-tenancy y workloads no confiables.</p>

          <p><a href="https://katacontainers.io/" target="_blank" rel="noopener"><strong><code>kata-containers</code></strong></a> va aún más lejos: cada contenedor corre dentro de una VM ligera con su propio kernel (KVM + QEMU, o Firecracker). El aislamiento es de VM, no de namespace. Se usa cuando la barrera contenedor-kernel de runc no es suficiente — típicamente para código de terceros con alto riesgo.</p>

          <p>Los cuatro respetan la misma interfaz OCI, así que Kubernetes puede intercambiarlos por Pod vía <a href="https://kubernetes.io/docs/concepts/containers/runtime-class/" target="_blank" rel="noopener">RuntimeClass</a>. Puedes tener runc para tu API pública y kata-containers para un Pod que corre código de terceros no confiable, en el mismo cluster.</p>
        `,
  en: `
          <p>When you run <code>docker run nginx</code>, the request passes through several layers of software before reaching the kernel. Understanding these layers is essential for diagnosing problems, configuring security, and reasoning about production behavior.</p>

          <h2>The architecture: Docker → containerd → runc</h2>

          <pre><code>docker run nginx
    │
    ▼
dockerd          ← The Docker daemon. Manages the API, images, networks, volumes.
    │  gRPC
    ▼
containerd       ← The high-level container runtime. Manages the lifecycle.
    │  ttRPC (initial shim spawn via fork+exec)
    ▼
containerd-shim  ← An intermediary process — one per container with Docker,
    │            one per Pod with CRI/Kubernetes (grouped by sandbox-id).
    │  fork+exec (once per runc create / start / delete invocation)
    ▼
runc             ← The low-level OCI runtime. Creates the container and exits.
    │  syscalls
    ▼
kernel           ← clone3(), mount(), pivot_root(), capset(), seccomp(), execve()...</code></pre>

          <p><a href="https://github.com/opencontainers/runc" target="_blank" rel="noopener"><code>runc</code></a> is the one that actually touches the kernel. Once the container is running, <code>runc</code> exits — the container stays alive under <code>containerd-shim</code>.</p>

          <p><a href="https://github.com/containerd/containerd/tree/main/core/runtime/v2" target="_blank" rel="noopener"><code>containerd-shim</code></a> exists for three concrete reasons:</p>

          <ol type="a">
            <li><strong>It carries the container's <code>stdout</code> and <code>stderr</code>.</strong> Per the <a href="https://github.com/containerd/containerd/blob/main/docs/runtime-v2.md" target="_blank" rel="noopener">official doc</a>: <em>"I/O for a container is provided by the client to the shim via fifo on Linux, named pipes on Windows, or log files on disk."</em> The shim owns those descriptors, which is why <code>docker logs</code> and <code>kubectl logs</code> keep working even after <code>runc</code> has exited.</li>

            <li><strong>It survives <code>containerd</code> restarts.</strong> The shim runs as an independent process with its own ttRPC socket; when <code>containerd</code> restarts, the doc states explicitly: <em>"when containerd boots and reconnects to shims. If a bundle is still on disk but containerd cannot connect to a shim, the delete command is invoked."</em> Containers keep running and <code>containerd</code> reconnects to the shim on startup — the cleanup path only fires if the shim is gone.</li>

            <li><strong>It acts as a <em>sub-reaper</em> for the container's PID 1.</strong> Direct quote from the doc: <em>"The shim process takes responsibility as a sub-reaper to cleanup exited containers or setns(2) processes."</em> When the container process exits, the shim adopts it, reaps it with <code>wait()</code>, and reports the exit code back to <code>containerd</code> over ttRPC.</li>
          </ol>

          <h2>The OCI bundle</h2>

          <p>The <a href="https://opencontainers.org/" target="_blank" rel="noopener">OCI (Open Container Initiative)</a> standard defines a bundle format in its <a href="https://github.com/opencontainers/runtime-spec/blob/main/bundle.md" target="_blank" rel="noopener">runtime-spec</a>: a directory with two elements:</p>

          <pre><code>/bundle/
├── config.json   ← Complete container specification
└── rootfs/       ← The root filesystem</code></pre>

          <p>The <a href="https://github.com/opencontainers/runtime-spec/blob/main/config.md" target="_blank" rel="noopener"><code>config.json</code></a> describes everything: which <a href="/tutorial/que-es-realmente-un-contenedor/namespaces">namespaces</a> to create, which <a href="/tutorial/que-es-realmente-un-contenedor/capabilities">capabilities</a> to have, mounts, environment variables, the entrypoint, <a href="/tutorial/que-es-realmente-un-contenedor/cgroups">cgroups</a>, and seccomp rules. It is exactly the same information you passed via <code>unshare</code> flags when <a href="/tutorial/que-es-realmente-un-contenedor/construyendo-un-contenedor">building a container by hand</a>, now packaged as JSON.</p>

          <pre><code>mkdir /tmp/bundle && cd /tmp/bundle
docker export $(docker create nginx) | tar -xC rootfs/
runc spec  # Generates a default config.json

# Inspect what it generated
cat config.json | jq '.process.capabilities'
cat config.json | jq '.linux.namespaces'</code></pre>

          <h2>The exact runc sequence</h2>

          <p>When executing <code>runc run</code>, the process performs in order:</p>

          <ol>
            <li><strong>Validate</strong> the OCI bundle (<code>config.json</code> + <code>rootfs/</code>).</li>
            <li><strong>Create the cgroup</strong> in <code>/sys/fs/cgroup/</code> with the specified <a href="/tutorial/que-es-realmente-un-contenedor/cgroups">limits</a>, and write its own PID to <code>cgroup.procs</code> so the future clone inherits the cgroup.</li>
            <li><strong>Call <a href="https://man7.org/linux/man-pages/man2/clone.2.html" target="_blank" rel="noopener"><code>clone3()</code></a></strong> with the namespace flags: <code>CLONE_NEWPID | CLONE_NEWNET | CLONE_NEWNS | CLONE_NEWUTS | CLONE_NEWIPC | CLONE_NEWCGROUP</code>, and optionally <code>CLONE_NEWUSER</code> if <code>config.json</code> declares a user namespace. These are eight of the <a href="/tutorial/que-es-realmente-un-contenedor/namespaces">eight types</a> minus <code>time</code>, which runc does not touch by default.</li>
            <li>The child process, now inside the new namespaces, runs <code>mount --make-rprivate /</code> to prevent mounts from propagating back to the host. Without this, <a href="/tutorial/que-es-realmente-un-contenedor/chroot-pivot-root"><code>pivot_root</code></a> fails with <code>EINVAL</code>.</li>
            <li>Configure the mounts from <code>config.json</code>: bind mounts, <code>/proc</code>, <code>/dev</code>, <code>/sys</code>.</li>
            <li><strong><a href="https://man7.org/linux/man-pages/man2/pivot_root.2.html" target="_blank" rel="noopener"><code>pivot_root</code></a></strong> to the container rootfs, followed by <code>umount -l</code> of the old root — this removes the host's mount table from the namespace.</li>
            <li><strong>Apply <a href="/tutorial/que-es-realmente-un-contenedor/capabilities">capabilities</a></strong> via <a href="https://man7.org/linux/man-pages/man2/capset.2.html" target="_blank" rel="noopener"><code>capset()</code></a> and <code>prctl(PR_CAPBSET_DROP, ...)</code>: reduce the bounding set to the one declared in <code>config.json</code>.</li>
            <li><strong>Apply the seccomp profile</strong> via the <a href="https://man7.org/linux/man-pages/man2/seccomp.2.html" target="_blank" rel="noopener"><code>seccomp(SECCOMP_SET_MODE_FILTER, ...)</code></a> syscall (the older <code>prctl(PR_SET_SECCOMP)</code> still works as a fallback, but the dedicated syscall is the modern API since kernel 3.17).</li>
            <li><strong><code>execve()</code></strong> the entrypoint defined in <code>config.json</code>.</li>
            <li><code>runc</code> exits. The container process remains under <code>containerd-shim</code>, with the cgroup, namespaces, and capabilities applied.</li>
          </ol>

          <h2>Verifying each step live</h2>

          <pre><code># Use strace to observe the syscalls runc makes.
# IMPORTANT: on modern kernels (and recent glibc) runc uses clone3,
# not clone. You need to ask for both explicitly, or use the %process
# alias which covers clone/clone3/fork/vfork/execve at once.
sudo strace -f -e trace=%process,unshare,pivot_root,mount \\
  runc run --bundle /tmp/bundle my-container 2>&1 | head -50</code></pre>

          <pre><code># Clone the process with namespace flags (clone3 on kernels ≥ 5.3)
clone3({flags=CLONE_NEWPID|CLONE_NEWNET|CLONE_NEWNS|
              CLONE_NEWUTS|CLONE_NEWIPC|CLONE_NEWCGROUP,
        exit_signal=SIGCHLD,
        stack=..., stack_size=...}, size=88) = 12345

# Make propagation private (so the next bind mount does not leak to the host)
mount("none", "/", NULL, MS_REC|MS_PRIVATE, NULL)

# Mount the rootfs
mount("/tmp/bundle/rootfs", "/tmp/bundle/rootfs", NULL, MS_BIND|MS_REC, NULL)

# pivot_root
pivot_root(".", ".old_root")

# Mount /proc inside the container
mount("proc", "/proc", "proc", MS_NOSUID|MS_NODEV|MS_NOEXEC, NULL)

# Execute the entrypoint
execve("/docker-entrypoint.sh", ["/docker-entrypoint.sh", "nginx", "-g", "daemon off;"], ...)</code></pre>

          <h2>containerd vs Docker: the distinction that matters</h2>

          <p>Kubernetes does not use Docker. It uses <strong>containerd</strong> directly (or CRI-O) through the <a href="https://kubernetes.io/docs/concepts/architecture/cri/" target="_blank" rel="noopener">Container Runtime Interface (CRI)</a>. Docker is just a convenience layer on top of containerd for development use. In production with Kubernetes:</p>

          <pre><code>kubelet → CRI → containerd → runc → kernel</code></pre>

          <p>The flow is shorter and the result is identical. When Kubernetes creates a Pod, <code>kubelet</code> asks <code>containerd</code> to create the specified containers. <code>containerd</code> calls <code>runc</code> for each one. <code>runc</code> applies the same steps described above — the same steps you applied by hand in <a href="/tutorial/que-es-realmente-un-contenedor/construyendo-un-contenedor">Step 7 of the previous chapter</a>.</p>

          <h2>Alternative runtimes</h2>

          <p><a href="https://github.com/opencontainers/runc" target="_blank" rel="noopener"><code>runc</code></a> is the OCI reference — written in Go, uses host namespaces directly, the general case. When you need different guarantees there are alternatives with the same OCI interface:</p>

          <p><a href="https://github.com/containers/crun" target="_blank" rel="noopener"><strong><code>crun</code></strong></a> is a drop-in replacement written in C. Same <code>config.json</code>, same namespaces, but it starts significantly faster and uses less memory — useful when running hundreds of containers per node. It is Podman's default runtime.</p>

          <p><a href="https://github.com/containers/youki" target="_blank" rel="noopener"><strong><code>youki</code></strong></a> is a modern OCI runtime written in Rust. Same profile as runc, but with Rust's memory-safety guarantees; interesting as an engineering experiment and increasingly adopted in production.</p>

          <p><a href="https://gvisor.dev/" target="_blank" rel="noopener"><strong><code>gVisor</code> (<code>runsc</code>)</strong></a> takes a different approach: instead of letting the container use the host kernel's syscalls, it intercepts them and executes them in a <em>user-space kernel</em> (Sentry). Isolation is much stronger — a host kernel vulnerability is out of reach from inside — at the cost of per-syscall overhead. Appropriate for multi-tenancy and untrusted workloads.</p>

          <p><a href="https://katacontainers.io/" target="_blank" rel="noopener"><strong><code>kata-containers</code></strong></a> goes further: each container runs inside a lightweight VM with its own kernel (KVM + QEMU, or Firecracker). Isolation is VM-grade, not namespace-grade. Used when the runc container-kernel boundary is not enough — typically for high-risk third-party code.</p>

          <p>All four honor the same OCI interface, so Kubernetes can swap them per Pod via <a href="https://kubernetes.io/docs/concepts/containers/runtime-class/" target="_blank" rel="noopener">RuntimeClass</a>. You can use runc for your public API and kata-containers for a Pod running untrusted third-party code, in the same cluster.</p>
        `,
};
