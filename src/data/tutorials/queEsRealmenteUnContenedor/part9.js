export default {
  es: `
          <p>Llegaste al final. Si seguiste la serie completa, ahora tienes un modelo mental preciso de qué es un contenedor — no una metáfora, sino una descripción mecánica de las primitivas del kernel que lo hacen posible.</p>

          <h2>El mapa completo</h2>

          <p>Un contenedor es la composición de cinco mecanismos del kernel, cada uno resolviendo una pregunta distinta:</p>

          <ul>
            <li><strong>Namespaces</strong> (<code>clone()</code>, <code>unshare()</code>, <code>setns()</code>) aislan lo que el proceso ve — PID, hostname, red, mounts, IPC, cgroups, UIDs y tiempo. Los ocho tipos con sus sutilezas están en <a href="/tutorial/que-es-realmente-un-contenedor/namespaces">Linux Namespaces</a>, incluyendo la diferencia entre "estar dentro del namespace" y "ver al proceso correcto en <code>/proc</code>", y el detalle del <a href="/tutorial/que-es-realmente-un-contenedor/namespaces#6-user-user-namespace">user namespace</a> que sustenta los contenedores rootless: UID 0 adentro mapea a un UID no privilegiado afuera, pero <code>sudo podman</code> <em>no</em> es rootless — solo Podman ejecutado como usuario normal lo es.</li>

            <li><strong>Capabilities</strong> (<code>capset()</code>, <code>/proc/&lt;pid&gt;/status</code>) rompen el privilegio binario "eres root o no" en 41 llaves granulares. Docker arranca con 14 activas; <code>CAP_SYS_ADMIN</code>, <code>CAP_NET_ADMIN</code>, <code>CAP_SYS_MODULE</code> y el resto de las peligrosas quedan fuera. Detalles en <a href="/tutorial/que-es-realmente-un-contenedor/capabilities">Linux Capabilities</a>.</li>

            <li><strong>pivot_root</strong> (<code>pivot_root()</code>) cambia la raíz del filesystem a nivel de mount namespace — a diferencia de <code>chroot</code>, que solo toca el puntero del proceso. Combinado con <code>umount -l</code> del viejo root, el filesystem del host desaparece de la tabla de montajes. Es lo que hace a los runtimes OCI (<code>runc</code>, <code>crun</code>, <code>youki</code>) inescapables vía el exploit clásico de chroot. Ver <a href="/tutorial/que-es-realmente-un-contenedor/chroot-pivot-root">chroot y pivot_root</a>.</li>

            <li><strong>OverlayFS</strong> (<code>mount -t overlay</code>) superpone capas read-only (<code>lowerdir</code>) sobre una capa escribible (<code>upperdir</code>), copiando archivos enteros al modificarlos (copy-up a nivel de archivo, no de bloque). Permite que decenas de contenedores compartan una sola imagen base. Detalles en <a href="/tutorial/que-es-realmente-un-contenedor/overlayfs">OverlayFS</a>.</li>

            <li><strong>cgroups v2</strong> (<code>/sys/fs/cgroup/</code>) imponen los límites reales: <code>cpu.max</code>, <code>memory.max</code>, <code>pids.max</code>; exponen PSI (<code>*.pressure</code>) para detectar saturación antes del OOM; y ofrecen primitivas operacionales (<code>cgroup.freeze</code>, <code>cgroup.kill</code>) que Docker y Kubernetes usan por debajo. Mucho más en <a href="/tutorial/que-es-realmente-un-contenedor/cgroups">cgroups</a>.</li>
          </ul>

          <p>El runtime (<code>runc</code>) orquesta todos estos mecanismos en el orden correcto — clone, mount, pivot_root, drop capabilities, apply seccomp, execve — leyendo la configuración de un bundle OCI. Docker y containerd son capas de conveniencia encima del runtime.</p>

          <h2>Lo que el kernel no sabe</h2>

          <p>El kernel no tiene concepto de "contenedor". Solo tiene procesos, namespaces, cgroups y mounts. La palabra "contenedor" es una convención de espacio de usuario — una forma de hablar sobre un proceso configurado de una manera particular.</p>

          <p>Esta distinción importa cuando algo falla: los problemas de contenedores son problemas de Linux. Las herramientas de debugging son las mismas: <code>strace</code>, <code>lsns</code>, <code>nsenter</code>, <code>ip</code>, <code>ss</code>, <code>cat /proc/...</code>.</p>

          <h2>Evidencia acumulada</h2>

          <p>La serie no es solo teoría — a lo largo de las partes ejecutamos experimentos que comprueban cada tesis:</p>

          <ul>
            <li><strong>El escape de chroot funciona, el de pivot_root no.</strong> Compilamos <a href="/tutorial/que-es-realmente-un-contenedor/chroot-pivot-root"><code>escape.c</code></a> con <code>gcc -static</code>, lo corrimos dentro de un <code>chroot</code> Alpine y aterrizamos en Ubuntu (tres <code>cat /etc/os-release</code> consecutivos confirmaron las transiciones Alpine → Ubuntu → Alpine). Luego repetimos dentro de un mount namespace con <code>pivot_root + umount -l /.old_root</code>: el mismo binario quedó atrapado en Alpine. La tabla de montajes del host ya no existía en ese namespace, así que no había "fuera" al que llegar.</li>

            <li><strong><code>cgroup.freeze</code> pausa procesos atómicamente.</strong> Con un contenedor escribiendo un contador por segundo, <code>echo 1 &gt; cgroup.freeze</code> produjo un gap de 46 segundos reales entre los ticks 104 y 105, aunque <code>docker ps</code> seguía reportando "Up" — Docker y el kernel tienen vistas desacopladas del estado del cgroup cuando manipulas el archivo directamente.</li>

            <li><strong>Los límites de cgroups reaccionan en vivo.</strong> <code>stress-ng --vm 1 --vm-bytes 200M</code> contra <code>--memory=128m</code> disparó 374 OOM kills en 30 segundos, visibles creciendo en vivo en <code>memory.events</code>. <code>stress-ng --cpu 4</code> contra <code>--cpus=0.25</code> alcanzó el 98% de throttling (<code>nr_throttled/nr_periods = 301/307</code>), con ~1.5 segundos de espera acumulada por cada segundo real.</li>

            <li><strong>"Rootless" con <code>sudo</code> no es rootless.</strong> El script <a href="/test-podman-userns.sh" download><code>test-podman-userns.sh</code></a> corrió Podman en tres modos (root directo, usuario normal sin sudo, sudoer con sudo). El <code>uid_map</code> de los casos 1 y 3 fue idéntico: <code>0 0 4294967295</code> (identity mapping). Solo el caso 2 mostró el mapeo real (<code>0 1001 1</code> más el subrango de <code>/etc/subuid</code>). Ser sudoer no cambia nada — lo único que importa es el UID efectivo que invoca al runtime.</li>
          </ul>

          <h2>Lo que no cubrimos</h2>

          <ul>
            <li><strong>seccomp</strong> — filtrado de syscalls permitidas a nivel de kernel (el perfil default de Docker bloquea ~40 syscalls).</li>
            <li><strong>AppArmor / SELinux</strong> — MAC (Mandatory Access Control) como capa adicional sobre capabilities.</li>
            <li><strong>OCI Image Spec</strong> — cómo se empaquetan, firman y distribuyen las imágenes (manifest JSON, media types, registries, content addressability). Cubrimos el filesystem que producen las imágenes en <a href="/tutorial/que-es-realmente-un-contenedor/overlayfs">OverlayFS</a>, pero no la spec de distribución.</li>
          </ul>

          <h2>Próximos pasos: Pods</h2>

          <p>En la siguiente serie veremos cómo Kubernetes agrupa varios contenedores en un <strong>Pod</strong>. La pregunta clave: si cada contenedor tiene sus propios namespaces, ¿cómo comparten red y filesystem dentro de un Pod?</p>

          <p>La respuesta involucra el <strong>pause container</strong> (también llamado "infra container"), un proceso mínimo que crea los namespaces compartidos del Pod y los mantiene vivos aunque los containers de aplicación se reinicien. Cuando <code>kubelet</code> crea un Pod, el primer container que arranca siempre es <code>pause</code> — los demás se unen a sus namespaces vía <code>setns()</code>. Ya viste la estructura en acción en la <a href="/tutorial/que-es-realmente-un-contenedor/cgroups">jerarquía de kubepods.slice</a>: cada Pod tiene ≥ 2 scopes en su cgroup — el primero es el pause container.</p>

          <pre><code># Puedes verlo en cualquier nodo de Kubernetes:
crictl ps | grep pause

# O con Docker en modo single-node:
docker ps | grep pause</code></pre>

          <p>Si entendiste esta serie, entender Pods será natural — son exactamente el mismo mecanismo, con namespaces selectivamente compartidos entre procesos.</p>
        `,
  en: `
          <p>You have reached the end. If you followed the complete series, you now have a precise mental model of what a container is — not a metaphor, but a mechanical description of the kernel primitives that make it possible.</p>

          <h2>The complete map</h2>

          <p>A container is the composition of five kernel mechanisms, each one solving a different question:</p>

          <ul>
            <li><strong>Namespaces</strong> (<code>clone()</code>, <code>unshare()</code>, <code>setns()</code>) isolate what the process sees — PID, hostname, network, mounts, IPC, cgroups, UIDs and time. The eight types with their subtleties are in <a href="/tutorial/que-es-realmente-un-contenedor/namespaces">Linux Namespaces</a>, including the difference between "being inside the namespace" and "seeing the right process in <code>/proc</code>", and the <a href="/tutorial/que-es-realmente-un-contenedor/namespaces#6-user-user-namespace">user namespace</a> detail that underpins rootless containers: UID 0 inside maps to an unprivileged UID outside, but <code>sudo podman</code> is <em>not</em> rootless — only Podman run as a regular user is.</li>

            <li><strong>Capabilities</strong> (<code>capset()</code>, <code>/proc/&lt;pid&gt;/status</code>) break the binary "you are root or you are not" privilege into 41 granular keys. Docker starts with 14 active; <code>CAP_SYS_ADMIN</code>, <code>CAP_NET_ADMIN</code>, <code>CAP_SYS_MODULE</code> and the other dangerous ones are excluded. Details in <a href="/tutorial/que-es-realmente-un-contenedor/capabilities">Linux Capabilities</a>.</li>

            <li><strong>pivot_root</strong> (<code>pivot_root()</code>) changes the filesystem root at the mount namespace level — unlike <code>chroot</code>, which only touches the process pointer. Combined with <code>umount -l</code> of the old root, the host's filesystem vanishes from the mount table. It is what makes OCI runtimes (<code>runc</code>, <code>crun</code>, <code>youki</code>) unescapable via the classic chroot exploit. See <a href="/tutorial/que-es-realmente-un-contenedor/chroot-pivot-root">chroot and pivot_root</a>.</li>

            <li><strong>OverlayFS</strong> (<code>mount -t overlay</code>) stacks read-only layers (<code>lowerdir</code>) over a writable layer (<code>upperdir</code>), copying whole files on modification (file-level copy-up, not block-level). Enables dozens of containers to share a single base image. Details in <a href="/tutorial/que-es-realmente-un-contenedor/overlayfs">OverlayFS</a>.</li>

            <li><strong>cgroups v2</strong> (<code>/sys/fs/cgroup/</code>) enforce the actual limits: <code>cpu.max</code>, <code>memory.max</code>, <code>pids.max</code>; expose PSI (<code>*.pressure</code>) to detect saturation before OOM; and provide operational primitives (<code>cgroup.freeze</code>, <code>cgroup.kill</code>) that Docker and Kubernetes use underneath. Much more in <a href="/tutorial/que-es-realmente-un-contenedor/cgroups">cgroups</a>.</li>
          </ul>

          <p>The runtime (<code>runc</code>) orchestrates all of these mechanisms in the correct order — clone, mount, pivot_root, drop capabilities, apply seccomp, execve — reading configuration from an OCI bundle. Docker and containerd are convenience layers on top.</p>

          <h2>What the kernel does not know</h2>

          <p>The kernel has no concept of a "container." It only has processes, namespaces, cgroups, and mounts. The word "container" is a user-space convention — a way of talking about a process configured in a particular way.</p>

          <p>This distinction matters when something fails: container problems are Linux problems. The debugging tools are the same: <code>strace</code>, <code>lsns</code>, <code>nsenter</code>, <code>ip</code>, <code>ss</code>, <code>cat /proc/...</code>.</p>

          <h2>Evidence gathered</h2>

          <p>The series is not only theory — along the way we ran experiments that confirm each thesis:</p>

          <ul>
            <li><strong>The chroot escape works; the pivot_root escape does not.</strong> We compiled <a href="/tutorial/que-es-realmente-un-contenedor/chroot-pivot-root"><code>escape.c</code></a> with <code>gcc -static</code>, ran it inside a <code>chroot</code> Alpine and landed on Ubuntu (three consecutive <code>cat /etc/os-release</code> reads confirmed the Alpine → Ubuntu → Alpine transitions). We then repeated inside a mount namespace with <code>pivot_root + umount -l /.old_root</code>: the same binary stayed trapped in Alpine. The host's mount table no longer existed in that namespace, so there was no "outside" to reach.</li>

            <li><strong><code>cgroup.freeze</code> pauses processes atomically.</strong> With a container writing a counter every second, <code>echo 1 &gt; cgroup.freeze</code> produced a 46-second gap in real time between ticks 104 and 105, even though <code>docker ps</code> kept reporting "Up" — Docker and the kernel have decoupled views of the cgroup state when you manipulate the file directly.</li>

            <li><strong>cgroups limits react live.</strong> <code>stress-ng --vm 1 --vm-bytes 200M</code> against <code>--memory=128m</code> triggered 374 OOM kills in 30 seconds, visible growing in <code>memory.events</code>. <code>stress-ng --cpu 4</code> against <code>--cpus=0.25</code> hit 98% throttling (<code>nr_throttled/nr_periods = 301/307</code>) with ~1.5s of accumulated wait per real second.</li>

            <li><strong>"Rootless" with <code>sudo</code> is not rootless.</strong> The <a href="/test-podman-userns.sh" download><code>test-podman-userns.sh</code></a> script ran Podman in three modes (direct root, regular user without sudo, sudoer with sudo). The <code>uid_map</code> of cases 1 and 3 was identical: <code>0 0 4294967295</code> (identity mapping). Only case 2 showed a real mapping (<code>0 1001 1</code> plus the <code>/etc/subuid</code> subrange). Being a sudoer changes nothing — only the effective UID that invokes the runtime matters.</li>
          </ul>

          <h2>What we did not cover</h2>

          <ul>
            <li><strong>seccomp</strong> — kernel-level syscall filtering (Docker's default profile blocks ~40 syscalls).</li>
            <li><strong>AppArmor / SELinux</strong> — MAC (Mandatory Access Control) as an additional layer on top of capabilities.</li>
            <li><strong>OCI Image Spec</strong> — how images are packaged, signed, and distributed (JSON manifest, media types, registries, content addressability). We covered the filesystem images produce in <a href="/tutorial/que-es-realmente-un-contenedor/overlayfs">OverlayFS</a>, but not the distribution spec.</li>
          </ul>

          <h2>Next steps: Pods</h2>

          <p>In the next series we will look at how Kubernetes groups multiple containers into a <strong>Pod</strong>. The key question: if each container has its own namespaces, how do they share the network and filesystem inside a Pod?</p>

          <p>The answer involves the <strong>pause container</strong> (also called the "infra container"), a minimal process that creates the Pod's shared namespaces and keeps them alive even when application containers restart. When <code>kubelet</code> creates a Pod, the first container to start is always <code>pause</code> — the rest join its namespaces via <code>setns()</code>. You already saw the structure in action in the <a href="/tutorial/que-es-realmente-un-contenedor/cgroups">kubepods.slice hierarchy</a>: every Pod has ≥ 2 scopes in its cgroup — the first one is the pause container.</p>

          <pre><code># You can see it on any Kubernetes node:
crictl ps | grep pause

# Or with Docker in single-node mode:
docker ps | grep pause</code></pre>

          <p>If you understood this series, understanding Pods will feel natural — it is exactly the same mechanism, with namespaces selectively shared among processes.</p>
        `,
};
