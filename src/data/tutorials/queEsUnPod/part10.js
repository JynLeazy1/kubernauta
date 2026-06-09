export default {
  es: `
          <p>Empezamos diciendo que un Pod no es un contenedor. Terminamos habiendo construido uno a mano con <code>unshare</code>, <a href="/tutorial/que-es-realmente-un-contenedor/chroot-pivot-root"><code>pivot_root</code></a> y <a href="/tutorial/que-es-realmente-un-contenedor/overlayfs">OverlayFS</a>. En el medio recorrimos cada capa que lo compone.</p>

          <h2>El mapa completo</h2>

          <p>El kernel es la base. Los <a href="/tutorial/que-es-realmente-un-contenedor/namespaces">namespaces</a> — net, IPC y UTS compartidos entre todos los contenedores del Pod; PID y mnt propios de cada uno — son la razón por la que los contenedores pueden comunicarse por <code>localhost</code> sin ser el mismo proceso. Los <a href="/tutorial/que-es-realmente-un-contenedor/cgroups">cgroups</a> definen los límites de CPU y memoria que el kernel aplica por contenedor.</p>

          <p>El <a href="/tutorial/que-es-un-pod/el-contenedor-pause">contenedor pause</a> sostiene esos namespaces compartidos. Es un proceso de 743 KB que no hace nada excepto existir y manejar señales — su único propósito es ser el ancla del Pod. Si un contenedor de la aplicación muere, solo ese contenedor se reinicia; el pause y sus namespaces siguen intactos, la IP del Pod no cambia.</p>

          <p>Sobre esa red, el <a href="/tutorial/que-es-un-pod/cni-la-ip-del-pod">plugin CNI</a> crea el veth pair y asigna la IP. Es un binario que el runtime invoca con variables de entorno y un JSON por stdin — sin servidor, sin protocolo largo.</p>

          <p>El <a href="/tutorial/que-es-un-pod/anatomia-del-spec">spec del Pod</a> es la traducción de todo lo anterior a YAML. <code>resources.limits</code> se convierte en <code>cpu.max</code> y <code>memory.max</code> en el cgroup. <code>securityContext</code> se convierte en <code>setuid</code>, <code>no_new_privs</code> y flags de <a href="/tutorial/que-es-realmente-un-contenedor/capabilities">capabilities</a>. <code>volumeMounts</code> son bind mounts antes del <code>pivot_root</code>.</p>

          <p><a href="/tutorial/que-es-un-pod/como-kubelet-crea-un-pod">kubelet</a> es el reconciliador. Traduce el spec a llamadas CRI — <code>RunPodSandbox</code>, <code>CreateContainer</code>, <code>StartContainer</code> — y mantiene el estado real del nodo alineado con lo que declaró el usuario.</p>

          <h2>El flujo de extremo a extremo</h2>

          <pre><code>kubectl apply
  → API server guarda el Pod en etcd
  → scheduler asigna nodeName
  → kubelet detecta el Pod
  → CRI: RunPodSandbox       → pause + namespaces (net/ipc/uts)
  → CNI plugin               → veth pair + IP asignada
  → CRI: CreateContainer × N → contenedores entran al sandbox
  → CRI: StartContainer × N  → pivot_root + exec del proceso
  → kubelet loop             → probes + reporte de estado</code></pre>

          <h2>Evidencia acumulada</h2>

          <p>La serie no es solo teoría — a lo largo de las partes ejecutamos experimentos que comprueban cada tesis:</p>

          <ul>
            <li><strong>El pause es el dueño del netns, no los containers de aplicación.</strong> En la <a href="/tutorial/que-es-un-pod/el-contenedor-pause">parte 3</a>, <code>lsns -p &lt;pid_pause&gt;</code> muestra <code>NPROCS=3</code> para los namespaces compartidos (net, ipc, uts) y <code>NPROCS=1</code> para los propios (mnt, pid). El proceso nginx aparece en la lista del netns del pause, pero su <code>/proc/&lt;pid&gt;/ns/net</code> es un <em>symlink</em> al inode del pause — confirmando que se une, no que posee.</li>

            <li><strong>Solo el contenedor que muere se reinicia.</strong> El manifest <code>test-restart.yaml</code> de la <a href="/tutorial/que-es-un-pod/el-contenedor-pause">parte 3</a> tiene un container <code>app</code> que crashea cada 10 segundos y un <code>sidecar</code> que escribe un timestamp cada 2 segundos. <code>kubectl get pod -w</code> muestra el ciclo <code>2/2 Running → 1/2 Error → 1/2 CrashLoopBackOff → 2/2 Running</code> sin que <code>kubectl logs sidecar</code> tenga ningún gap. La IP del Pod tampoco cambia.</li>

            <li><strong>El YAML se materializa en archivos del kernel.</strong> En la <a href="/tutorial/que-es-un-pod/anatomia-del-spec">parte 6</a> tomamos un Pod con <code>resources.limits.cpu: 500m</code> y <code>limits.memory: 256Mi</code>; los archivos del cgroup correspondiente reportan <code>cpu.max = 50000 100000</code> y <code>memory.max = 268435456</code>, exactamente las dimensiones declaradas en YAML.</li>

            <li><strong>Calico no usa bridge.</strong> En la <a href="/tutorial/que-es-un-pod/cni-la-ip-del-pod">parte 5</a>, <code>ip link show type veth</code> revela interfaces <code>cali...@if3</code> con MAC <code>ee:ee:ee:ee:ee:ee</code> que no están enganchadas a ningún bridge. <code>ip route get &lt;pod-ip&gt;</code> muestra una ruta <code>/32</code> dedicada apuntando directamente al veth — la diferencia arquitectónica con Flannel/<code>cni0</code>.</li>
          </ul>

          <h2>La relación con el tutorial anterior</h2>

          <p>Si venías del <a href="/tutorial/que-es-realmente-un-contenedor">tutorial de contenedores</a>, ahora puedes ver la jerarquía completa:</p>

          <pre><code>Nodo físico / VM
└── kubelet
    └── Pod (unidad de scheduling)
        ├── Namespaces compartidos (net, ipc, uts)
        ├── Contenedor pause — sostiene los namespaces
        ├── Init containers — secuenciales, terminan antes del arranque
        └── Contenedores regulares
            ├── OverlayFS propio (lowerdirs = capas de imagen, upperdir = escrituras)
            └── cgroup propio (cpu.max, memory.max)</code></pre>

          <h2>Lo que no cubrimos</h2>

          <ul>
            <li><strong>Admission controllers y webhooks</strong> — la vía por la que controladores como Istio inyectan sidecars antes de que el Pod llegue a kubelet, y por la que tools como Kyverno/OPA Gatekeeper aplican políticas antes del schedule.</li>
            <li><strong>Downward API</strong> — cómo pasar metadatos del Pod (nombre, namespace, labels, IP) al proceso vía variables de entorno o archivos en un volume.</li>
            <li><strong>Ephemeral containers</strong> — el mecanismo de <code>kubectl debug</code> para inyectar containers temporales en un Pod en vivo, útil para imágenes distroless.</li>
            <li><strong>Scheduling avanzado</strong> — <code>nodeSelector</code>, taints/tolerations, affinity/anti-affinity, topology spread constraints, <code>PriorityClass</code> y preempción. La parte 4 cubre <em>que</em> el scheduler asigna el nodo, no <em>cómo</em> elige.</li>
            <li><strong>Romper aislamiento intencionalmente</strong> — <code>hostNetwork</code>, <code>hostPID</code>, <code>hostIPC</code>, <code>hostPath</code>, <code>privileged: true</code>. Útiles para agentes de nodo (Calico, kube-proxy, observability), peligrosos en cargas de aplicación.</li>
            <li><strong>Pod Disruption Budgets y graceful node shutdown</strong> — cómo Kubernetes coordina drains para no dejar workloads sin réplicas mínimas.</li>
            <li><strong>OCI Image Spec y supply chain</strong> — qué es un manifest, cómo se firman imágenes, content addressability. Cubrimos el <a href="/tutorial/que-es-realmente-un-contenedor/overlayfs">filesystem</a> que producen, no la spec de distribución.</li>
          </ul>

          <h2>Conclusión</h2>

          <p>La próxima vez que alguien diga que un Pod es la unidad mínima de cómputo de Kubernetes, podrás explicar por qué es así: qué namespaces crea el kernel, qué rol cumple el contenedor pause, cómo el CNI asigna la red, y cómo cada campo del spec se traduce en una primitiva del sistema operativo que los contenedores heredan al unirse al sandbox.</p>

          <p>Y si alguien intenta venderte que "Kubernetes es magia", ya tienes la respuesta: <em>no, son cuatro o cinco syscalls del kernel encadenadas por kubelet vía un proto de gRPC, materializándose en archivos del kernel que puedes leer con <code>cat</code>.</em></p>
        `,
  en: `
          <p>We started by saying that a Pod is not a container. We finish having built one by hand with <code>unshare</code>, <a href="/tutorial/que-es-realmente-un-contenedor/chroot-pivot-root"><code>pivot_root</code></a>, and <a href="/tutorial/que-es-realmente-un-contenedor/overlayfs">OverlayFS</a>. In between, we walked through every layer that makes it up.</p>

          <h2>The complete map</h2>

          <p>The kernel is the foundation. <a href="/tutorial/que-es-realmente-un-contenedor/namespaces">Namespaces</a> — net, IPC, and UTS shared among all containers in the Pod; PID and mnt owned by each one — are the reason containers can communicate over <code>localhost</code> without being the same process. <a href="/tutorial/que-es-realmente-un-contenedor/cgroups">cgroups</a> define the CPU and memory limits the kernel enforces per container.</p>

          <p>The <a href="/tutorial/que-es-un-pod/el-contenedor-pause">pause container</a> holds those shared namespaces. It is a 743 KB process that does nothing except exist and handle signals — its only purpose is to be the Pod's anchor. If an application container dies, only that container restarts; pause and its namespaces stay intact, the Pod's IP does not change.</p>

          <p>On top of that network, the <a href="/tutorial/que-es-un-pod/cni-la-ip-del-pod">CNI plugin</a> creates the veth pair and assigns the IP. It is a binary the runtime invokes with environment variables and a JSON on stdin — no server, no long-running protocol.</p>

          <p>The <a href="/tutorial/que-es-un-pod/anatomia-del-spec">Pod spec</a> is the translation of all of the above into YAML. <code>resources.limits</code> becomes <code>cpu.max</code> and <code>memory.max</code> in the cgroup. <code>securityContext</code> becomes <code>setuid</code>, <code>no_new_privs</code>, and <a href="/tutorial/que-es-realmente-un-contenedor/capabilities">capability</a> flags. <code>volumeMounts</code> are bind mounts before <code>pivot_root</code>.</p>

          <p><a href="/tutorial/que-es-un-pod/como-kubelet-crea-un-pod">kubelet</a> is the reconciler. It translates the spec into CRI calls — <code>RunPodSandbox</code>, <code>CreateContainer</code>, <code>StartContainer</code> — and keeps the actual node state aligned with what the user declared.</p>

          <h2>The end-to-end flow</h2>

          <pre><code>kubectl apply
  → API server saves the Pod in etcd
  → scheduler assigns nodeName
  → kubelet detects the Pod
  → CRI: RunPodSandbox       → pause + namespaces (net/ipc/uts)
  → CNI plugin               → veth pair + IP assigned
  → CRI: CreateContainer × N → containers join the sandbox
  → CRI: StartContainer × N  → pivot_root + process exec
  → kubelet loop             → probes + state reporting</code></pre>

          <h2>Evidence gathered</h2>

          <p>The series is not only theory — along the way we ran experiments that confirm each thesis:</p>

          <ul>
            <li><strong>pause owns the netns; the application containers do not.</strong> In <a href="/tutorial/que-es-un-pod/el-contenedor-pause">Part 3</a>, <code>lsns -p &lt;pause_pid&gt;</code> shows <code>NPROCS=3</code> for the shared namespaces (net, ipc, uts) and <code>NPROCS=1</code> for the owned ones (mnt, pid). The nginx process appears in the pause's netns process list, but its <code>/proc/&lt;pid&gt;/ns/net</code> is a <em>symlink</em> to the pause's inode — confirming it joins, it does not own.</li>

            <li><strong>Only the dying container restarts.</strong> The <code>test-restart.yaml</code> manifest in <a href="/tutorial/que-es-un-pod/el-contenedor-pause">Part 3</a> has an <code>app</code> container that crashes every 10 seconds and a <code>sidecar</code> that writes a timestamp every 2. <code>kubectl get pod -w</code> shows the cycle <code>2/2 Running → 1/2 Error → 1/2 CrashLoopBackOff → 2/2 Running</code> while <code>kubectl logs sidecar</code> shows no gap. The Pod's IP also does not change.</li>

            <li><strong>YAML materialises into kernel files.</strong> In <a href="/tutorial/que-es-un-pod/anatomia-del-spec">Part 6</a> we took a Pod with <code>resources.limits.cpu: 500m</code> and <code>limits.memory: 256Mi</code>; the corresponding cgroup files report <code>cpu.max = 50000 100000</code> and <code>memory.max = 268435456</code>, exactly the dimensions declared in YAML.</li>

            <li><strong>Calico does not use a bridge.</strong> In <a href="/tutorial/que-es-un-pod/cni-la-ip-del-pod">Part 5</a>, <code>ip link show type veth</code> reveals <code>cali...@if3</code> interfaces with MAC <code>ee:ee:ee:ee:ee:ee</code> that are not attached to any bridge. <code>ip route get &lt;pod-ip&gt;</code> shows a dedicated <code>/32</code> route pointing straight at the veth — the architectural difference with Flannel/<code>cni0</code>.</li>
          </ul>

          <h2>The relationship with the previous tutorial</h2>

          <p>If you came from the <a href="/tutorial/que-es-realmente-un-contenedor">containers tutorial</a>, you can now see the complete hierarchy:</p>

          <pre><code>Physical node / VM
└── kubelet
    └── Pod (scheduling unit)
        ├── Shared namespaces (net, ipc, uts)
        ├── pause container — holds the namespaces
        ├── Init containers — sequential, finish before startup
        └── Regular containers
            ├── Own OverlayFS (lowerdirs = image layers, upperdir = writes)
            └── Own cgroup (cpu.max, memory.max)</code></pre>

          <h2>What we did not cover</h2>

          <ul>
            <li><strong>Admission controllers and webhooks</strong> — the path through which controllers like Istio inject sidecars before the Pod reaches kubelet, and through which tools like Kyverno/OPA Gatekeeper enforce policies before scheduling.</li>
            <li><strong>Downward API</strong> — how to pass Pod metadata (name, namespace, labels, IP) into the process via env vars or files in a volume.</li>
            <li><strong>Ephemeral containers</strong> — the <code>kubectl debug</code> mechanism to inject temporary containers into a live Pod, useful for distroless images.</li>
            <li><strong>Advanced scheduling</strong> — <code>nodeSelector</code>, taints/tolerations, affinity/anti-affinity, topology spread constraints, <code>PriorityClass</code>, and preemption. Part 4 covers <em>that</em> the scheduler assigns the node, not <em>how</em> it chooses.</li>
            <li><strong>Intentionally breaking isolation</strong> — <code>hostNetwork</code>, <code>hostPID</code>, <code>hostIPC</code>, <code>hostPath</code>, <code>privileged: true</code>. Useful for node agents (Calico, kube-proxy, observability), dangerous in application workloads.</li>
            <li><strong>Pod Disruption Budgets and graceful node shutdown</strong> — how Kubernetes coordinates drains so workloads never drop below their minimum replica count.</li>
            <li><strong>OCI Image Spec and supply chain</strong> — what a manifest is, how images are signed, content addressability. We covered the <a href="/tutorial/que-es-realmente-un-contenedor/overlayfs">filesystem</a> images produce, not the distribution spec.</li>
          </ul>

          <h2>Conclusion</h2>

          <p>The next time someone says a Pod is the minimum unit of compute in Kubernetes, you will be able to explain why: which namespaces the kernel creates, what role the pause container plays, how the CNI assigns the network, and how each spec field translates into an operating system primitive that containers inherit when they join the sandbox.</p>

          <p>And if anyone tries to sell you that "Kubernetes is magic", you have your answer ready: <em>no — it is four or five kernel syscalls chained by kubelet via a gRPC proto, materialising in kernel files you can read with <code>cat</code>.</em></p>
        `,
}
