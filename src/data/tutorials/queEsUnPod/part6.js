export default {
  es: `
          <p>Cuando escribes un Pod en YAML, lo que estás haciendo es declarar el estado deseado — Kubernetes se encarga del resto. Pero "el resto" no es magia: cada campo del spec tiene una traducción concreta a una primitiva del sistema operativo. <code>resources.limits</code> se convierte en un <a href="/tutorial/que-es-realmente-un-contenedor/cgroups">cgroup</a>. <code>securityContext</code> se convierte en <a href="/tutorial/que-es-realmente-un-contenedor/capabilities">capabilities</a> y flags de proceso. <code>volumeMounts</code> se convierte en bind mounts antes del <a href="/tutorial/que-es-realmente-un-contenedor/chroot-pivot-root"><code>pivot_root</code></a>.</p>

          <p>Esta sección recorre los campos más importantes del spec y muestra a qué instrucción del kernel o llamada al runtime se traducen. Para los conceptos del kernel referenciamos las partes correspondientes del <a href="/tutorial/que-es-realmente-un-contenedor">tutorial de contenedores</a> en lugar de re-explicar.</p>

          <h2>El árbol del manifest: Pod-level vs container-level</h2>

          <p>Antes de entrar campo por campo, vale la pena entender la estructura. El <code>spec</code> de un Pod tiene dos niveles claros — los campos que viven directamente bajo <code>spec</code> afectan al sandbox completo (al pause y a los namespaces compartidos), mientras que los que viven bajo <code>spec.containers[*]</code> aplican uno por cada container:</p>

          <pre><code>apiVersion: v1
kind: Pod
spec:                       # ← Pod-level: afecta al sandbox / pause
  nodeSelector: { ... }       # scheduling
  serviceAccountName: ...     # token montado en el sandbox
  hostNetwork: false          # comparte netns del host
  terminationGracePeriodSeconds: 30
  volumes:                    # declaración global de volumes
    - name: data
      emptyDir: {}

  containers:                 # ← lista; los siguientes campos van por container
    - name: app
      image: my-app:1.0
      resources: { ... }      # cgroup propio
      securityContext: { ... } # caps y flags propios del proceso
      volumeMounts:             # apunta a uno de los volumes de arriba
        - name: data
          mountPath: /var/data</code></pre>

          <p>Esta separación explica un detalle frecuentemente confuso: <code>volumes</code> declara <em>qué volumes están disponibles para este Pod</em>, mientras que <code>volumeMounts</code> dice <em>cómo cada container los monta</em>. Un mismo volume puede aparecer en varios <code>volumeMounts</code> — los containers comparten el mismo bind mount source, exactamente como dos containers compartiendo un directorio en Docker.</p>

          <h2><code>resources.requests</code> y <code>resources.limits</code> → cgroups</h2>

          <pre><code>resources:
  requests:
    cpu: "250m"
    memory: "128Mi"
  limits:
    cpu: "500m"
    memory: "256Mi"</code></pre>

          <p><code>limits</code> es lo que el kernel aplica directamente como <a href="/tutorial/que-es-realmente-un-contenedor/cgroups">cgroup v2</a>. <code>cpu: "500m"</code> se traduce a <code>cpu.max = "50000 100000"</code> (50ms de cada 100ms de período). <code>memory: "256Mi"</code> se traduce a <code>memory.max = 268435456</code>. Si el proceso supera ese límite el OOM killer lo mata y verás <code>oom_kill</code> incrementarse en <code>memory.events</code>.</p>

          <p><code>requests</code> no es un límite del kernel — es una promesa al scheduler para el binpacking. Kubernetes garantiza que el nodo tiene esos recursos disponibles antes de asignar el Pod. En cgroups v2 se traduce a <code>cpu.weight</code> (peso relativo, no cuota dura): <code>requests.cpu: 250m</code> ≈ <code>cpu.weight ≈ 25</code>.</p>

          <h2><code>securityContext</code> → capabilities y flags del proceso</h2>

          <p>Existe en dos niveles que se mergean — los del Pod aplican como default a todos los containers, los del container sobrescriben:</p>

          <pre><code>spec:
  securityContext:                # ← Pod-level: defaults para todos los containers
    runAsNonRoot: true              # rechaza el Pod si algún container corre como UID 0
    fsGroup: 2000                   # GID dueño de los volumes montados
  containers:
    - name: app
      securityContext:            # ← container-level: gana sobre el Pod-level
        runAsUser: 1000
        runAsGroup: 1000
        allowPrivilegeEscalation: false
        capabilities:
          drop: ["ALL"]
          add: ["NET_BIND_SERVICE"]
        readOnlyRootFilesystem: true
        seccompProfile:
          type: RuntimeDefault
        # appArmorProfile / seLinuxOptions también van acá</code></pre>

          <p>Algunos campos solo existen a nivel Pod (<code>fsGroup</code>, <code>supplementalGroups</code>, <code>sysctls</code>) porque afectan al sandbox completo o a recursos compartidos. Otros solo a nivel container (<code>capabilities</code>, <code>readOnlyRootFilesystem</code>). El resto puede aparecer en ambos.</p>

          <h3><code>runAsUser</code> / <code>runAsGroup</code> / <code>runAsNonRoot</code></h3>

          <p><code>runAsUser: 1000</code> se traduce a un <code>setuid(1000)</code> después del <code>execve</code>; análogo para <code>runAsGroup</code>. Es exactamente la misma mecánica de UIDs que vimos en el tutorial de contenedores en <a href="/tutorial/que-es-realmente-un-contenedor/capabilities#por-que-root-en-un-contenedor-sigue-siendo-peligroso">por qué root en un contenedor sigue siendo peligroso</a>: el proceso no es root del namespace, es UID 1000 — con todas las restricciones que eso implica para acceso a archivos y syscalls privilegiadas.</p>

          <p><code>runAsNonRoot: true</code> es una <em>guarda</em> a nivel kubelet: rechaza el Pod en startup si algún container intenta correr como UID 0. No previene escapes (eso lo hace el user namespace) pero sí evita la clase entera de bugs donde un Dockerfile se olvidó del <code>USER</code>.</p>

          <h3><code>allowPrivilegeEscalation: false</code></h3>

          <p>Activa el flag <code>no_new_privs</code> del kernel vía <a href="https://man7.org/linux/man-pages/man2/prctl.2.html" target="_blank" rel="noopener"><code>prctl(PR_SET_NO_NEW_PRIVS, 1)</code></a>. Una vez puesto, el proceso (y todos sus hijos) <strong>nunca</strong> pueden adquirir más privilegios de los que ya tienen — específicamente:</p>

          <ul>
            <li><strong>Bits setuid/setgid en binarios se ignoran</strong>. Ejecutar <code>/usr/bin/sudo</code> o <code>/usr/bin/passwd</code> ya no eleva al proceso a root.</li>
            <li><strong>File capabilities (<code>setcap cap_*</code>)</strong> tampoco se aplican. Un binario con <code>cap_net_raw=ep</code> ejecutado en este proceso corre sin esa capability.</li>
            <li><strong>LSM transitions</strong> (AppArmor, SELinux) tampoco pueden cambiar a un perfil más permisivo en el siguiente <code>execve</code>.</li>
          </ul>

          <p>Verificable en cualquier proceso:</p>

          <pre><code>cat /proc/&lt;pid&gt;/status | grep NoNewPrivs
# NoNewPrivs:	1   ← activo

# Una vez en 1, no se puede revertir. Es un boolean monotónico.</code></pre>

          <p>Es el flag más barato y efectivo para hardening. <code>kubectl run</code> normal lo deja en 0 por default; explícitamente <code>allowPrivilegeEscalation: false</code> lo activa.</p>

          <h3><code>capabilities</code> drop/add</h3>

          <p>Modifica los conjuntos de <a href="/tutorial/que-es-realmente-un-contenedor/capabilities">capabilities</a> del proceso. <code>drop: ["ALL"]</code> deja el bounding set vacío; el <code>add</code> reactiva solo las que enumeres. Las herramientas para listar qué capabilities tiene un container se cubren en <a href="/tutorial/que-es-realmente-un-contenedor/capabilities#como-listar-capabilities-en-linux">Cómo listar capabilities en Linux</a>: <code>capsh --print</code>, <code>getpcaps &lt;pid&gt;</code>, <code>getcap</code>.</p>

          <h3><code>readOnlyRootFilesystem: true</code></h3>

          <p>Monta el <a href="/tutorial/que-es-realmente-un-contenedor/overlayfs">OverlayFS</a> del container con la flag <code>MS_RDONLY</code> del kernel. Cualquier write al rootfs falla con <code>EROFS</code> — útil para inmutabilidad y para forzar que la app use volumes explícitos (<code>emptyDir</code>) en los paths donde sí necesita escribir.</p>

          <p>Verificable comparando un container con la flag y otro sin ella:</p>

          <pre><code># Sin readOnlyRootFilesystem (default)
kubectl run rw-test --image=alpine --restart=Never -- \\
  sh -c "touch /test && mount | grep ' / '"
# /test created OK
# overlay on / type overlay (rw,relatime,...)   ← rw

# Con readOnlyRootFilesystem: true
cat &lt;&lt;EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata: { name: ro-test }
spec:
  containers:
    - name: app
      image: alpine
      command: ["sh","-c","touch /test || mount | grep ' / '"]
      securityContext:
        readOnlyRootFilesystem: true
EOF
kubectl logs ro-test
# touch: /test: Read-only file system           ← EROFS
# overlay on / type overlay (ro,relatime,...)   ← ro</code></pre>

          <p>Las apps que escriben a <code>/tmp</code>, <code>/var/log</code> o <code>/var/run</code> seguirán funcionando si esos paths se montan como <code>emptyDir</code> separados. Patrón común:</p>

          <pre><code>volumeMounts:
  - { name: tmp,  mountPath: /tmp }
  - { name: run,  mountPath: /var/run }
volumes:
  - { name: tmp,  emptyDir: {} }
  - { name: run,  emptyDir: {} }</code></pre>

          <h3><code>seccompProfile</code> → filtrado de syscalls</h3>

          <p><a href="https://man7.org/linux/man-pages/man2/seccomp.2.html" target="_blank" rel="noopener">seccomp</a> es un filtro de syscalls a nivel kernel — para cada syscall que el proceso intenta ejecutar, el kernel evalúa un BPF program y decide si la deja pasar o la bloquea con <code>EPERM</code> / <code>SIGSYS</code>. Tres modos:</p>

          <pre><code>securityContext:
  seccompProfile:
    type: RuntimeDefault    # perfil del runtime (containerd's default-allowlist)
    # type: Unconfined      # NINGÚN filtro — peligroso
    # type: Localhost       # perfil custom desde un archivo del nodo
    # localhostProfile: profiles/audit.json</code></pre>

          <p><code>RuntimeDefault</code> aplica el perfil que trae containerd: una lista de allowlist de ~340 syscalls que cubre el 99% de las apps. Bloquea cosas como <code>kexec_load</code>, <code>perf_event_open</code>, <code>userfaultfd</code> que ninguna app legítima necesita pero los exploits sí.</p>

          <p>Desde Kubernetes 1.27, el campo <code>seccompDefault: true</code> en la config de kubelet activa <code>RuntimeDefault</code> para todos los Pods aunque no lo declaren. Vale la pena habilitarlo a nivel de cluster — el costo es mínimo y la superficie de ataque baja considerablemente.</p>

          <h3><code>appArmorProfile</code> y <code>seLinuxOptions</code> → MAC</h3>

          <p>Ambos son <strong>Mandatory Access Control</strong>: una capa adicional al modelo discrecional de Linux (UIDs, permisos POSIX). Cuál uses depende del nodo:</p>

          <ul>
            <li><strong>AppArmor</strong> (Ubuntu, Debian, SUSE) — perfiles basados en path, más fáciles de escribir. K8s 1.30+ soporta el campo nativo:
              <pre><code>securityContext:
  appArmorProfile:
    type: RuntimeDefault    # cri-containerd-default
    # type: Localhost
    # localhostProfile: my-profile</code></pre>
              Antes de 1.30 era una annotation: <code>container.apparmor.security.beta.kubernetes.io/&lt;container&gt;: ...</code>.</li>
            <li><strong>SELinux</strong> (RHEL, CentOS, Fedora) — perfiles basados en labels (type/role/user). Más estricto, más complejo:
              <pre><code>securityContext:
  seLinuxOptions:
    level: "s0:c123,c456"
    type: "container_t"</code></pre>
              kubelet asigna labels únicos a cada Pod por default; explícitamente sobrescribirlos es raro y solo útil cuando integrás con políticas existentes del sistema.</li>
          </ul>

          <p>Verificación — <code>cat /proc/&lt;pid&gt;/attr/current</code> muestra el contexto LSM activo del proceso:</p>

          <pre><code># En un nodo SELinux
cat /proc/$(pgrep nginx)/attr/current
# system_u:system_r:container_t:s0:c123,c456

# En un nodo AppArmor
cat /proc/$(pgrep nginx)/attr/current
# cri-containerd.apparmor.d (enforce)</code></pre>

          <p>Si el archivo está vacío (<code>cat: ... empty</code>), el host no tiene LSM activo o el container está en modo <code>Unconfined</code>. AppArmor / SELinux no se mezclan — un kernel solo puede tener uno o el otro, no ambos.</p>

          <h2><code>volumeMounts</code> → bind mounts</h2>

          <pre><code>volumeMounts:
  - name: config
    mountPath: /etc/app/config
    readOnly: true</code></pre>

          <p>Cada <code>volumeMount</code> es un bind mount que runc ejecuta <em>antes</em> del <a href="/tutorial/que-es-realmente-un-contenedor/chroot-pivot-root"><code>pivot_root</code></a>. El directorio del volumen en el host se monta en el path especificado del contenedor. <code>readOnly: true</code> agrega <code>MS_RDONLY</code> al mount, que el kernel respeta independientemente de los permisos del filesystem subyacente.</p>

          <p>Para volumes tipo <code>emptyDir</code>, kubelet crea un directorio en el host (típicamente bajo <code>/var/lib/kubelet/pods/&lt;uid&gt;/volumes/kubernetes.io~empty-dir/&lt;name&gt;/</code>) y lo bind-montea. Para <code>configMap</code> y <code>secret</code>, kubelet escribe los archivos primero en un tmpfs y luego lo bind-montea — así el contenido nunca toca el disco persistente del nodo.</p>

          <h2>Tipos de <code>volumes</code></h2>

          <p>Los <code>volumes</code> declarados arriba en el spec son la fuente — qué tipo elijas determina qué hace kubelet por detrás. Los más comunes:</p>

          <ul>
            <li><strong><code>emptyDir</code></strong> — directorio efímero en el host. Vive lo que vive el Pod. Útil para staging entre containers (init container escribe, app container lee) o como scratch space. Con <code>medium: Memory</code> queda en tmpfs.</li>
            <li><strong><code>hostPath</code></strong> — bind mount directo de un path del host. <strong>Peligroso</strong> en aplicaciones (escapa el aislamiento del filesystem); reservado para agentes de nodo (Calico, kube-proxy, observability) que <em>necesitan</em> ver <code>/proc</code>, <code>/var/log</code> o <code>/run/containerd/containerd.sock</code>.</li>
            <li><strong><code>configMap</code> / <code>secret</code></strong> — kubelet renderiza los keys del ConfigMap/Secret a archivos individuales en un tmpfs y los bind-montea. Los Secrets quedan en RAM, nunca en disco persistente del nodo.</li>
            <li><strong><code>projected</code></strong> — combina varias fuentes (Secrets, ConfigMaps, downward API, ServiceAccount tokens) en un solo mount point. <strong>Es el mecanismo del token de ServiceAccount</strong> que vimos en <a href="/tutorial/que-es-un-pod/como-kubelet-crea-un-pod">la parte 4</a> (<code>kube-api-access-XXXX</code> en <code>/var/run/secrets/kubernetes.io/serviceaccount/</code>).</li>
            <li><strong><code>persistentVolumeClaim</code></strong> — referencia a un <code>PersistentVolume</code> que un CSI driver (AWS EBS, Ceph RBD, NFS, etc.) provee. kubelet le pide al CSI que monte el storage en el nodo, y luego bind-montea el path resultante en el container. Sobrevive recreaciones del Pod.</li>
            <li><strong><code>downwardAPI</code></strong> — expone metadata del Pod (nombre, namespace, labels, IP, recursos) como archivos. Útil cuando una app necesita saber su propia identidad sin hablar con el API server.</li>
          </ul>

          <p>Sea cual sea el tipo, el resultado final dentro del container es el mismo: un bind mount en el path declarado por <code>volumeMounts.mountPath</code>. Lo que cambia es qué pone kubelet del lado del host antes del bind.</p>

          <h2><code>env</code> → variables de entorno del proceso</h2>

          <pre><code>env:
  - name: DB_HOST
    value: postgres
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: db-secret
        key: password</code></pre>

          <p>Las variables simples se pasan directamente a <code>execve</code>. Las que vienen de Secrets o ConfigMaps las resuelve kubelet antes de arrancar el contenedor y las inyecta igual. Desde la perspectiva del proceso no hay diferencia — son <code>environ[]</code>. Por eso un <code>cat /proc/&lt;pid&gt;/environ</code> desde el host expone los valores de los Secrets en texto plano: la "encriptación" termina en etcd; en el proceso son strings.</p>

          <h2><code>command</code> y <code>args</code> → el exec del proceso</h2>

          <pre><code>command: ["nginx"]
args: ["-g", "daemon off;"]</code></pre>

          <p><code>command</code> sobreescribe el <code>ENTRYPOINT</code> de la imagen; <code>args</code> sobreescribe el <code>CMD</code>. Son los argumentos que runc pasa a <code>execve</code> al arrancar el proceso. Si no se especifican, runc usa los del Dockerfile (que <code>runc spec</code> copió al <code>config.json</code> al construir el bundle OCI — ver <a href="/tutorial/que-es-realmente-un-contenedor/container-runtime">qué hace el container runtime</a>).</p>

          <h2><code>livenessProbe</code> / <code>readinessProbe</code> → polling de kubelet</h2>

          <pre><code>livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  periodSeconds: 10</code></pre>

          <p>Las probes <strong>no las ejecuta el kernel</strong> — las ejecuta kubelet desde fuera del contenedor. Para <code>httpGet</code>, kubelet hace una petición HTTP al Pod desde su propio proceso. Para <code>exec</code>, kubelet le pide a containerd que corra el comando dentro del contenedor vía CRI (<code>ExecSync</code>). Para <code>tcpSocket</code>, kubelet abre una conexión TCP al puerto. Los detalles operativos de los tres tipos (liveness vs readiness vs startup) y sus tradeoffs están en la <a href="/tutorial/que-es-un-pod/ciclo-de-vida">parte 8 de este tutorial</a>.</p>

          <h2><code>serviceAccountName</code> → identidad del Pod ante el API server</h2>

          <pre><code>spec:
  serviceAccountName: my-app   # default: "default" del namespace</code></pre>

          <p>El <code>serviceAccountName</code> determina <em>quién es el Pod</em> cuando habla con el API server. kubelet monta automáticamente un volume <code>projected</code> en <code>/var/run/secrets/kubernetes.io/serviceaccount/</code> con tres archivos: <code>token</code> (un JWT firmado por el API server), <code>ca.crt</code> (el CA del cluster) y <code>namespace</code>. Cualquier librería cliente — <code>client-go</code>, <code>kubernetes-python</code>, etc. — los lee por default y construye sus requests con <code>Authorization: Bearer &lt;token&gt;</code>.</p>

          <p>Los permisos del Pod los define <strong>RBAC</strong>: el ServiceAccount se vincula a uno o más Roles/ClusterRoles vía RoleBinding/ClusterRoleBinding. Si tu app solo necesita leer ConfigMaps, le das un Role con <code>verbs: ["get","list","watch"]</code> sobre <code>resources: ["configmaps"]</code>. Sin RoleBinding, el ServiceAccount no puede leer <em>nada</em> — pero igual existe y igual recibe su token; "no autorizado" no significa "anónimo".</p>

          <p>Si tu Pod no necesita hablar con el API server (la mayoría de apps stateless), apagá el montaje del token — reduce superficie de ataque y evita filtraciones accidentales del JWT:</p>

          <pre><code>spec:
  automountServiceAccountToken: false   # no monta el token en /var/run/secrets/...</code></pre>

          <h2><code>ports</code>: la trampita informativa</h2>

          <pre><code>ports:
  - containerPort: 8080
    name: http
    protocol: TCP</code></pre>

          <p>Acá hay una sutileza que confunde a casi todo el mundo: <strong><code>ports</code> no abre nada</strong>. Es <em>solo metadata</em>. El proceso adentro del container es libre de escuchar en cualquier puerto que quiera; el kernel le da acceso al stack de red completo del namespace, sin verificar si está declarado.</p>

          <p>Lo que sí hace <code>ports</code>: (a) le da nombre a un puerto para que un Service lo referencie con <code>targetPort: http</code> en lugar de un número; (b) lo expone en <code>kubectl describe pod</code> y en eventos; (c) si declarás <code>hostPort</code>, kubelet sí abre el mapeo en el host vía iptables/portmap CNI plugin.</p>

          <p>El típico bug: declarás <code>containerPort: 8080</code> pero la app escucha en 9090. <code>kubectl get pod</code> dice "Running", todo se ve bien — hasta que el Service intenta conectar al 8080 y falla. <code>ss -tlnp</code> dentro del Pod (o vía <code>nsenter</code> al netns desde el host) muestra el puerto real. Regla práctica: tratá <code>containerPort</code> como documentación, no como configuración.</p>

          <h2><code>imagePullPolicy</code> → cuándo llama kubelet a <code>PullImage</code></h2>

          <pre><code>imagePullPolicy: IfNotPresent  # solo descarga si no está en caché local</code></pre>

          <p>Tres valores posibles, cada uno controla cuándo kubelet invoca la operación <code>PullImage</code> del CRI. <code>Always</code> dispara la descarga en cada arranque del contenedor — útil para tags mutables como <code>latest</code> donde quieres siempre la versión más reciente. <code>IfNotPresent</code> (el default cuando usas un tag específico) descarga solo si el digest no está en la caché del runtime — el caso común para producción con tags inmutables. <code>Never</code> nunca descarga; falla si la imagen no está local — útil para entornos air-gapped o pre-loaded.</p>

          <h2>Del YAML al cgroup, en vivo</h2>

          <p>Para verificar que esto no es teoría, tomamos un Pod del cluster con sus campos declarados y leemos los archivos del kernel correspondientes. La estructura de cgroups que kubelet construye fue cubierta a fondo en <a href="/tutorial/que-es-realmente-un-contenedor/cgroups">la parte 6 del tutorial de contenedores</a>; aquí solo resumimos los paths.</p>

          <pre><code># En el nodo donde corre el Pod:
POD=$(kubectl get pod nginx -o jsonpath='{.metadata.uid}' | tr - _)
QOS=burstable    # o besteffort / guaranteed según resources
SLICE=/sys/fs/cgroup/kubepods.slice/kubepods-\${QOS}.slice/\\
kubepods-\${QOS}-pod\${POD}.slice

ls \${SLICE}
# kubepods-\${QOS}-pod\${POD}.slice/
# cri-containerd-3a9dd44...scope/    ← pause container
# cri-containerd-b2171cb14...scope/  ← container de aplicación

# Leer el cpu.max efectivo del container de aplicación
SCOPE=\${SLICE}/cri-containerd-b2171cb14...scope
cat \${SCOPE}/cpu.max
# 50000 100000     ← coincide con limits.cpu: 500m

cat \${SCOPE}/memory.max
# 178257920        ← ≈ 170 MB para limits.memory: 170Mi

cat \${SCOPE}/cpu.weight
# 11               ← derivado de requests.cpu (bajo)

# Verificar capabilities efectivas
cat /proc/$(pgrep -f nginx | head -1)/status | grep Cap
# CapEff: 00000000a80425fb   ← reducido por capabilities.drop/add</code></pre>

          <p>Los valores que escribiste en el YAML aparecen literalmente en archivos del kernel. No hay capa intermedia oculta — el "spec" del Pod es una receta que se materializa en cgroup files, mount entries, capability sets y argumentos de <code>execve</code>. Cualquier inconsistencia entre lo declarado y lo aplicado se ve aquí, antes de que la app diga "algo no funciona".</p>
        `,
  en: `
          <p>When you write a Pod in YAML, what you are doing is declaring the desired state — Kubernetes takes care of the rest. But "the rest" is not magic: every field in the spec has a concrete translation to an operating system primitive. <code>resources.limits</code> becomes a <a href="/tutorial/que-es-realmente-un-contenedor/cgroups">cgroup</a>. <code>securityContext</code> becomes <a href="/tutorial/que-es-realmente-un-contenedor/capabilities">capabilities</a> and process flags. <code>volumeMounts</code> becomes bind mounts before <a href="/tutorial/que-es-realmente-un-contenedor/chroot-pivot-root"><code>pivot_root</code></a>.</p>

          <p>This section walks through the most important spec fields and shows which kernel instruction or runtime call they translate to. For the kernel concepts we cross-reference the relevant parts of the <a href="/tutorial/que-es-realmente-un-contenedor">containers tutorial</a> instead of re-explaining.</p>

          <h2>The manifest tree: Pod-level vs container-level</h2>

          <p>Before going field by field, it helps to understand the structure. The <code>spec</code> of a Pod has two clear levels — fields directly under <code>spec</code> affect the whole sandbox (the pause and the shared namespaces), while fields under <code>spec.containers[*]</code> apply once per container:</p>

          <pre><code>apiVersion: v1
kind: Pod
spec:                       # ← Pod-level: affects the sandbox / pause
  nodeSelector: { ... }       # scheduling
  serviceAccountName: ...     # token mounted in the sandbox
  hostNetwork: false          # share the host's netns
  terminationGracePeriodSeconds: 30
  volumes:                    # global volume declarations
    - name: data
      emptyDir: {}

  containers:                 # ← list; the following fields apply per container
    - name: app
      image: my-app:1.0
      resources: { ... }      # its own cgroup
      securityContext: { ... } # its own caps and process flags
      volumeMounts:             # references one of the volumes above
        - name: data
          mountPath: /var/data</code></pre>

          <p>This separation explains a frequently confusing detail: <code>volumes</code> declares <em>which volumes are available to this Pod</em>, while <code>volumeMounts</code> says <em>how each container mounts them</em>. The same volume can appear in several <code>volumeMounts</code> — containers share the same bind mount source, exactly like two containers sharing a directory in Docker.</p>

          <h2><code>resources.requests</code> and <code>resources.limits</code> → cgroups</h2>

          <pre><code>resources:
  requests:
    cpu: "250m"
    memory: "128Mi"
  limits:
    cpu: "500m"
    memory: "256Mi"</code></pre>

          <p><code>limits</code> is what the kernel enforces directly as a <a href="/tutorial/que-es-realmente-un-contenedor/cgroups">cgroup v2</a> setting. <code>cpu: "500m"</code> translates to <code>cpu.max = "50000 100000"</code> (50ms out of every 100ms period). <code>memory: "256Mi"</code> translates to <code>memory.max = 268435456</code>. If the process exceeds that limit the OOM killer terminates it, and you'll see <code>oom_kill</code> increment in <code>memory.events</code>.</p>

          <p><code>requests</code> is not a kernel limit — it is a promise to the scheduler for binpacking. Kubernetes guarantees the node has those resources available before assigning the Pod. In cgroups v2 it translates to <code>cpu.weight</code> (a relative weight, not a hard quota): <code>requests.cpu: 250m</code> ≈ <code>cpu.weight ≈ 25</code>.</p>

          <h2><code>securityContext</code> → capabilities and process flags</h2>

          <p>It exists at two levels that get merged — Pod-level acts as a default for every container, container-level overrides:</p>

          <pre><code>spec:
  securityContext:                # ← Pod-level: defaults for every container
    runAsNonRoot: true              # reject the Pod if any container runs as UID 0
    fsGroup: 2000                   # GID owning the mounted volumes
  containers:
    - name: app
      securityContext:            # ← container-level: wins over Pod-level
        runAsUser: 1000
        runAsGroup: 1000
        allowPrivilegeEscalation: false
        capabilities:
          drop: ["ALL"]
          add: ["NET_BIND_SERVICE"]
        readOnlyRootFilesystem: true
        seccompProfile:
          type: RuntimeDefault
        # appArmorProfile / seLinuxOptions go here too</code></pre>

          <p>Some fields exist only at Pod level (<code>fsGroup</code>, <code>supplementalGroups</code>, <code>sysctls</code>) because they affect the whole sandbox or shared resources. Others only at container level (<code>capabilities</code>, <code>readOnlyRootFilesystem</code>). The rest can appear at both.</p>

          <h3><code>runAsUser</code> / <code>runAsGroup</code> / <code>runAsNonRoot</code></h3>

          <p><code>runAsUser: 1000</code> translates to a <code>setuid(1000)</code> after <code>execve</code>; analogous for <code>runAsGroup</code>. It is the same UID mechanic we saw in the containers tutorial under <a href="/tutorial/que-es-realmente-un-contenedor/capabilities#why-root-inside-a-container-is-still-dangerous">why root inside a container is still dangerous</a>: the process is no longer the namespace's root, it is UID 1000 — with all the restrictions that implies for file access and privileged syscalls.</p>

          <p><code>runAsNonRoot: true</code> is a <em>guard</em> at the kubelet level: it rejects the Pod at startup if any container tries to run as UID 0. It does not prevent escapes (the user namespace does that) but it does block the entire class of bugs where a Dockerfile forgot the <code>USER</code> directive.</p>

          <h3><code>allowPrivilegeEscalation: false</code></h3>

          <p>Enables the kernel's <code>no_new_privs</code> flag via <a href="https://man7.org/linux/man-pages/man2/prctl.2.html" target="_blank" rel="noopener"><code>prctl(PR_SET_NO_NEW_PRIVS, 1)</code></a>. Once set, the process (and all its children) <strong>can never</strong> acquire more privileges than they already hold — specifically:</p>

          <ul>
            <li><strong>setuid/setgid bits on binaries are ignored</strong>. Running <code>/usr/bin/sudo</code> or <code>/usr/bin/passwd</code> no longer elevates the process to root.</li>
            <li><strong>File capabilities (<code>setcap cap_*</code>)</strong> are not applied either. A binary with <code>cap_net_raw=ep</code> executed inside this process runs without that capability.</li>
            <li><strong>LSM transitions</strong> (AppArmor, SELinux) cannot move to a more permissive profile on the next <code>execve</code>.</li>
          </ul>

          <p>Verifiable on any process:</p>

          <pre><code>cat /proc/&lt;pid&gt;/status | grep NoNewPrivs
# NoNewPrivs:	1   ← active

# Once it is 1, it cannot be reverted. It is a monotonic boolean.</code></pre>

          <p>It is the cheapest, most effective hardening flag. Plain <code>kubectl run</code> leaves it at 0 by default; explicitly setting <code>allowPrivilegeEscalation: false</code> turns it on.</p>

          <h3><code>capabilities</code> drop/add</h3>

          <p>Modifies the process's <a href="/tutorial/que-es-realmente-un-contenedor/capabilities">capability sets</a>. <code>drop: ["ALL"]</code> empties the bounding set; <code>add</code> re-enables only the ones you list. The tools to inspect a container's effective capabilities are covered in <a href="/tutorial/que-es-realmente-un-contenedor/capabilities#how-to-list-capabilities-on-linux">How to list capabilities on Linux</a>: <code>capsh --print</code>, <code>getpcaps &lt;pid&gt;</code>, <code>getcap</code>.</p>

          <h3><code>readOnlyRootFilesystem: true</code></h3>

          <p>Mounts the container's <a href="/tutorial/que-es-realmente-un-contenedor/overlayfs">OverlayFS</a> with the kernel's <code>MS_RDONLY</code> flag. Any write to the rootfs fails with <code>EROFS</code> — great for immutability and for forcing the app to use explicit volumes (<code>emptyDir</code>) for paths that genuinely need to write.</p>

          <p>Verifiable by comparing a container with the flag against one without:</p>

          <pre><code># Without readOnlyRootFilesystem (default)
kubectl run rw-test --image=alpine --restart=Never -- \\
  sh -c "touch /test && mount | grep ' / '"
# /test created OK
# overlay on / type overlay (rw,relatime,...)   ← rw

# With readOnlyRootFilesystem: true
cat &lt;&lt;EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata: { name: ro-test }
spec:
  containers:
    - name: app
      image: alpine
      command: ["sh","-c","touch /test || mount | grep ' / '"]
      securityContext:
        readOnlyRootFilesystem: true
EOF
kubectl logs ro-test
# touch: /test: Read-only file system           ← EROFS
# overlay on / type overlay (ro,relatime,...)   ← ro</code></pre>

          <p>Apps that write to <code>/tmp</code>, <code>/var/log</code> or <code>/var/run</code> still work fine if those paths are mounted as separate <code>emptyDir</code>s. Common pattern:</p>

          <pre><code>volumeMounts:
  - { name: tmp,  mountPath: /tmp }
  - { name: run,  mountPath: /var/run }
volumes:
  - { name: tmp,  emptyDir: {} }
  - { name: run,  emptyDir: {} }</code></pre>

          <h3><code>seccompProfile</code> → syscall filtering</h3>

          <p><a href="https://man7.org/linux/man-pages/man2/seccomp.2.html" target="_blank" rel="noopener">seccomp</a> is a kernel-level syscall filter — for every syscall the process tries to make, the kernel evaluates a BPF program and decides whether to allow it or block it with <code>EPERM</code> / <code>SIGSYS</code>. Three modes:</p>

          <pre><code>securityContext:
  seccompProfile:
    type: RuntimeDefault    # the runtime's profile (containerd's default-allowlist)
    # type: Unconfined      # NO filter — dangerous
    # type: Localhost       # custom profile from a node-local file
    # localhostProfile: profiles/audit.json</code></pre>

          <p><code>RuntimeDefault</code> applies the profile shipped with containerd: an allowlist of ~340 syscalls that covers 99% of apps. It blocks calls like <code>kexec_load</code>, <code>perf_event_open</code>, <code>userfaultfd</code> that no legitimate app needs but exploits do.</p>

          <p>Since Kubernetes 1.27, the <code>seccompDefault: true</code> field on the kubelet config enables <code>RuntimeDefault</code> for every Pod that does not declare it. Worth turning on cluster-wide — the cost is tiny and the attack surface drops considerably.</p>

          <h3><code>appArmorProfile</code> and <code>seLinuxOptions</code> → MAC</h3>

          <p>Both are <strong>Mandatory Access Control</strong>: an extra layer on top of Linux's discretionary model (UIDs, POSIX permissions). Which one you use depends on the node:</p>

          <ul>
            <li><strong>AppArmor</strong> (Ubuntu, Debian, SUSE) — path-based profiles, easier to write. K8s 1.30+ supports the native field:
              <pre><code>securityContext:
  appArmorProfile:
    type: RuntimeDefault    # cri-containerd-default
    # type: Localhost
    # localhostProfile: my-profile</code></pre>
              Before 1.30 it was an annotation: <code>container.apparmor.security.beta.kubernetes.io/&lt;container&gt;: ...</code>.</li>
            <li><strong>SELinux</strong> (RHEL, CentOS, Fedora) — label-based profiles (type/role/user). Stricter, more complex:
              <pre><code>securityContext:
  seLinuxOptions:
    level: "s0:c123,c456"
    type: "container_t"</code></pre>
              kubelet assigns unique labels to every Pod by default; explicitly overriding them is rare and only useful when integrating with the system's existing policies.</li>
          </ul>

          <p>Verification — <code>cat /proc/&lt;pid&gt;/attr/current</code> shows the process's active LSM context:</p>

          <pre><code># On a SELinux node
cat /proc/$(pgrep nginx)/attr/current
# system_u:system_r:container_t:s0:c123,c456

# On an AppArmor node
cat /proc/$(pgrep nginx)/attr/current
# cri-containerd.apparmor.d (enforce)</code></pre>

          <p>If the file is empty (<code>cat: ... empty</code>), the host has no LSM enabled or the container is in <code>Unconfined</code> mode. AppArmor / SELinux do not coexist — a kernel can have one or the other, not both.</p>

          <h2><code>volumeMounts</code> → bind mounts</h2>

          <pre><code>volumeMounts:
  - name: config
    mountPath: /etc/app/config
    readOnly: true</code></pre>

          <p>Each <code>volumeMount</code> is a bind mount that runc executes <em>before</em> <a href="/tutorial/que-es-realmente-un-contenedor/chroot-pivot-root"><code>pivot_root</code></a>. The volume directory on the host is mounted at the specified container path. <code>readOnly: true</code> adds <code>MS_RDONLY</code> to the mount, which the kernel honors regardless of the permissions on the underlying filesystem.</p>

          <p>For <code>emptyDir</code> volumes, kubelet creates a directory on the host (typically under <code>/var/lib/kubelet/pods/&lt;uid&gt;/volumes/kubernetes.io~empty-dir/&lt;name&gt;/</code>) and bind-mounts it. For <code>configMap</code> and <code>secret</code>, kubelet writes the files first to a tmpfs and bind-mounts that — so the content never touches the node's persistent disk.</p>

          <h2>Types of <code>volumes</code></h2>

          <p>The <code>volumes</code> declared at the Pod level are the source — which type you pick determines what kubelet actually does behind the scenes. The most common ones:</p>

          <ul>
            <li><strong><code>emptyDir</code></strong> — ephemeral directory on the host. Lives as long as the Pod does. Useful as staging between containers (init container writes, app container reads) or as scratch space. With <code>medium: Memory</code> it lives in tmpfs.</li>
            <li><strong><code>hostPath</code></strong> — direct bind mount of a host path. <strong>Dangerous</strong> in applications (escapes filesystem isolation); reserved for node agents (Calico, kube-proxy, observability) that <em>need</em> to see <code>/proc</code>, <code>/var/log</code> or <code>/run/containerd/containerd.sock</code>.</li>
            <li><strong><code>configMap</code> / <code>secret</code></strong> — kubelet renders the ConfigMap/Secret keys to individual files in a tmpfs and bind-mounts that. Secrets stay in RAM, never touching the node's persistent disk.</li>
            <li><strong><code>projected</code></strong> — combines several sources (Secrets, ConfigMaps, downward API, ServiceAccount tokens) into a single mount point. <strong>This is the mechanism behind the ServiceAccount token</strong> we saw in <a href="/tutorial/que-es-un-pod/como-kubelet-crea-un-pod">Part 4</a> (<code>kube-api-access-XXXX</code> at <code>/var/run/secrets/kubernetes.io/serviceaccount/</code>).</li>
            <li><strong><code>persistentVolumeClaim</code></strong> — reference to a <code>PersistentVolume</code> that a CSI driver (AWS EBS, Ceph RBD, NFS, etc.) provisions. kubelet asks the CSI to mount the storage on the node, then bind-mounts the resulting path into the container. Survives Pod recreations.</li>
            <li><strong><code>downwardAPI</code></strong> — exposes Pod metadata (name, namespace, labels, IP, resources) as files. Useful when an app needs to know its own identity without talking to the API server.</li>
          </ul>

          <p>Whatever the type, the final result inside the container is the same: a bind mount at the path declared by <code>volumeMounts.mountPath</code>. What changes is what kubelet places on the host side before the bind.</p>

          <h2><code>env</code> → process environment variables</h2>

          <pre><code>env:
  - name: DB_HOST
    value: postgres
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: db-secret
        key: password</code></pre>

          <p>Simple variables are passed directly to <code>execve</code>. Variables sourced from Secrets or ConfigMaps are resolved by kubelet before starting the container and injected the same way. From the process's perspective there is no difference — they are <code>environ[]</code>. That is why a <code>cat /proc/&lt;pid&gt;/environ</code> from the host exposes Secret values in plaintext: the "encryption" ends at etcd; inside the process they are strings.</p>

          <h2><code>command</code> and <code>args</code> → the process exec</h2>

          <pre><code>command: ["nginx"]
args: ["-g", "daemon off;"]</code></pre>

          <p><code>command</code> overrides the image's <code>ENTRYPOINT</code>; <code>args</code> overrides <code>CMD</code>. These are the arguments runc passes to <code>execve</code> when starting the process. If not specified, runc uses the ones from the Dockerfile (which <code>runc spec</code> copied into <code>config.json</code> when assembling the OCI bundle — see <a href="/tutorial/que-es-realmente-un-contenedor/container-runtime">what the container runtime does</a>).</p>

          <h2><code>livenessProbe</code> / <code>readinessProbe</code> → kubelet polling</h2>

          <pre><code>livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  periodSeconds: 10</code></pre>

          <p>Probes are <strong>not executed by the kernel</strong> — they are executed by kubelet from outside the container. For <code>httpGet</code>, kubelet makes an HTTP request to the Pod from its own process. For <code>exec</code>, kubelet asks containerd to run the command inside the container via CRI (<code>ExecSync</code>). For <code>tcpSocket</code>, kubelet opens a TCP connection to the port. The operational details of all three types (liveness vs readiness vs startup) and their trade-offs live in <a href="/tutorial/que-es-un-pod/ciclo-de-vida">Part 8 of this tutorial</a>.</p>

          <h2><code>serviceAccountName</code> → the Pod's identity to the API server</h2>

          <pre><code>spec:
  serviceAccountName: my-app   # default: namespace's "default"</code></pre>

          <p>The <code>serviceAccountName</code> determines <em>who the Pod is</em> when it talks to the API server. kubelet automatically mounts a <code>projected</code> volume at <code>/var/run/secrets/kubernetes.io/serviceaccount/</code> with three files: <code>token</code> (a JWT signed by the API server), <code>ca.crt</code> (the cluster CA) and <code>namespace</code>. Any client library — <code>client-go</code>, <code>kubernetes-python</code>, etc. — reads them by default and builds requests with <code>Authorization: Bearer &lt;token&gt;</code>.</p>

          <p>The Pod's permissions are set by <strong>RBAC</strong>: the ServiceAccount is bound to one or more Roles/ClusterRoles via RoleBinding/ClusterRoleBinding. If your app only needs to read ConfigMaps, give it a Role with <code>verbs: ["get","list","watch"]</code> over <code>resources: ["configmaps"]</code>. Without a RoleBinding, the ServiceAccount cannot read <em>anything</em> — but it still exists and still gets its token; "unauthorized" is not the same as "anonymous".</p>

          <p>If your Pod has no need to talk to the API server (most stateless apps), turn off the token mount — it shrinks the attack surface and prevents accidental JWT leaks:</p>

          <pre><code>spec:
  automountServiceAccountToken: false   # do not mount the token at /var/run/secrets/...</code></pre>

          <h2><code>ports</code>: the informational gotcha</h2>

          <pre><code>ports:
  - containerPort: 8080
    name: http
    protocol: TCP</code></pre>

          <p>There is a subtlety here that confuses almost everyone: <strong><code>ports</code> opens nothing</strong>. It is <em>just metadata</em>. The process inside the container is free to listen on any port it wants; the kernel gives it full access to the namespace's network stack with no cross-check against what was declared.</p>

          <p>What <code>ports</code> actually does: (a) names a port so a Service can reference it as <code>targetPort: http</code> instead of by number; (b) exposes it in <code>kubectl describe pod</code> and events; (c) if you declare <code>hostPort</code>, kubelet does open the mapping on the host via iptables/the portmap CNI plugin.</p>

          <p>The classic bug: you declare <code>containerPort: 8080</code> but the app listens on 9090. <code>kubectl get pod</code> says "Running", everything looks fine — until the Service tries to connect to 8080 and fails. <code>ss -tlnp</code> inside the Pod (or via <code>nsenter</code> into the netns from the host) shows the real port. Rule of thumb: treat <code>containerPort</code> as documentation, not configuration.</p>

          <h2><code>imagePullPolicy</code> → when kubelet calls <code>PullImage</code></h2>

          <pre><code>imagePullPolicy: IfNotPresent  # only downloads if not in local cache</code></pre>

          <p>Three possible values, each controlling when kubelet invokes the CRI's <code>PullImage</code>. <code>Always</code> triggers a pull on every container start — useful for mutable tags like <code>latest</code> where you always want the newest version. <code>IfNotPresent</code> (the default when using a specific tag) only downloads if the digest is not in the runtime cache — the common case for production with immutable tags. <code>Never</code> never downloads; it fails if the image is not local — useful for air-gapped or pre-loaded environments.</p>

          <h2>From YAML to cgroup, live</h2>

          <p>To confirm this is not theory, take a Pod from the cluster with its declared fields and read the corresponding kernel files. The cgroup structure kubelet builds is covered in depth in <a href="/tutorial/que-es-realmente-un-contenedor/cgroups">Part 6 of the containers tutorial</a>; here we just summarise the paths.</p>

          <pre><code># On the node where the Pod runs:
POD=$(kubectl get pod nginx -o jsonpath='{.metadata.uid}' | tr - _)
QOS=burstable    # or besteffort / guaranteed depending on resources
SLICE=/sys/fs/cgroup/kubepods.slice/kubepods-\${QOS}.slice/\\
kubepods-\${QOS}-pod\${POD}.slice

ls \${SLICE}
# kubepods-\${QOS}-pod\${POD}.slice/
# cri-containerd-3a9dd44...scope/    ← pause container
# cri-containerd-b2171cb14...scope/  ← application container

# Read the effective cpu.max of the application container
SCOPE=\${SLICE}/cri-containerd-b2171cb14...scope
cat \${SCOPE}/cpu.max
# 50000 100000     ← matches limits.cpu: 500m

cat \${SCOPE}/memory.max
# 178257920        ← ≈ 170 MB for limits.memory: 170Mi

cat \${SCOPE}/cpu.weight
# 11               ← derived from requests.cpu (low)

# Check the effective capabilities
cat /proc/$(pgrep -f nginx | head -1)/status | grep Cap
# CapEff: 00000000a80425fb   ← reduced by capabilities.drop/add</code></pre>

          <p>The values you wrote in YAML appear literally in kernel files. There is no hidden middle layer — the Pod's "spec" is a recipe that materialises into cgroup files, mount entries, capability sets, and <code>execve</code> arguments. Any mismatch between what was declared and what was applied is visible right here, before the app even gets a chance to say "something is off".</p>
        `,
}
