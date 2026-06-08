export default {
  es: `
          <p>Hasta ahora vimos las piezas: el contenedor pause, los namespaces, el filesystem. Pero ¿qué desencadena todo eso? ¿Quién llama a quién y en qué orden? Esta parte sigue el camino exacto desde que el usuario ejecuta <code>kubectl apply</code> hasta que el Pod está corriendo.</p>

          <h2>Paso 1 — El scheduler asigna el Pod a un nodo</h2>

          <p>Cuando creas un Pod, el API server lo guarda en etcd con <code>nodeName: ""</code>. El scheduler lo detecta, evalúa qué nodo tiene recursos disponibles, y actualiza el campo <code>nodeName</code> del Pod con el nodo elegido. A partir de ahí el scheduler ya no interviene más.</p>

          <h2>Paso 2 — kubelet detecta el Pod</h2>

          <p>kubelet corre en cada nodo y tiene un watch abierto contra el API server. En cuanto el Pod queda asignado a su nodo, kubelet lo recibe y empieza el proceso de creación.</p>

          <h2>Paso 3 — kubelet llama al CRI</h2>

          <p>kubelet no habla directamente con containerd ni con runc. Habla con el CRI (Container Runtime Interface), una API gRPC estándar que abstrae el runtime. El contrato está definido en <a href="https://github.com/kubernetes/cri-api/blob/master/pkg/apis/runtime/v1/api.proto" target="_blank" rel="noopener noreferrer">api.proto</a> como un servicio gRPC:</p>

          <pre><code>// api.proto — kubernetes/cri-api
service RuntimeService {
  rpc RunPodSandbox(RunPodSandboxRequest)   returns (RunPodSandboxResponse) {}
  rpc CreateContainer(CreateContainerRequest) returns (CreateContainerResponse) {}
  rpc StartContainer(StartContainerRequest)   returns (StartContainerResponse) {}
  rpc StopContainer(StopContainerRequest)     returns (StopContainerResponse) {}
  rpc RemovePodSandbox(RemovePodSandboxRequest) returns (RemovePodSandboxResponse) {}
  rpc Exec(ExecRequest)                       returns (ExecResponse) {}
  rpc Attach(AttachRequest)                   returns (AttachResponse) {}
  rpc PortForward(PortForwardRequest)         returns (PortForwardResponse) {}
  // ...
}</code></pre>

          <p>Cada línea <code>rpc</code> define un método remoto: el nombre, el tipo del mensaje de entrada y el tipo del mensaje de respuesta, ambos también definidos en el mismo proto:</p>

          <pre><code>message RunPodSandboxRequest {
  PodSandboxConfig config = 1;  // spec del sandbox: namespaces, hostname, dns...
  string runtime_handler = 2;  // "runc", "kata-containers", etc.
}

message RunPodSandboxResponse {
  string pod_sandbox_id = 1;   // ID que kubelet usará en CreateContainer
}</code></pre>

          <p>kubelet serializa el request a binario protobuf y lo envía sobre un Unix socket HTTP/2. Del otro lado, containerd lo deserializa y ejecuta la operación. La implementación real de <code>RunPodSandbox</code> en containerd está en <a href="https://github.com/containerd/containerd/blob/main/internal/cri/server/sandbox_run.go" target="_blank" rel="noopener noreferrer">internal/cri/server/sandbox_run.go</a>:</p>

          <pre><code>// containerd — sandbox_run.go
func (c *criService) RunPodSandbox(
  ctx context.Context,
  r *runtime.RunPodSandboxRequest,
) (_ *runtime.RunPodSandboxResponse, retErr error) { ... }</code></pre>

          <p>Lo que hace elegante este diseño es que kubelet no sabe qué hay del otro lado — solo conoce el contrato protobuf. Cambiar de containerd a CRI-O es cambiar qué proceso escucha en el socket <code>/run/containerd/containerd.sock</code>.</p>

          <p>La primera llamada es <code>RunPodSandbox</code>, que crea el sandbox del Pod — el contenedor pause:</p>

          <pre><code>kubelet → CRI (containerd) → RunPodSandbox(config)</code></pre>

          <p>El runtime:</p>

          <ul>
            <li>Descarga la imagen <code>registry.k8s.io/pause</code> si no está en caché</li>
            <li>Crea los namespaces del Pod: net, IPC, UTS</li>
            <li>Arranca el proceso <code>/pause</code></li>
            <li>Devuelve un <code>podSandboxID</code></li>
          </ul>

          <h2>Paso 4 — el plugin CNI configura la red</h2>

          <p>Inmediatamente después de crear el sandbox, el runtime invoca el plugin CNI configurado en el nodo (Calico, Flannel, Cilium, etc.). El plugin recibe el network namespace del pause y:</p>

          <ul>
            <li>Crea un par de interfaces veth: una dentro del namespace del Pod (<code>eth0</code>), otra en el host (<code>cali...</code> o <code>veth...</code>)</li>
            <li>Asigna la IP del Pod a <code>eth0</code></li>
            <li>Configura las rutas necesarias</li>
          </ul>

          <p>A partir de este momento el Pod tiene IP. Esa IP pertenece al namespace de red del pause — todos los contenedores que se unan a ese namespace la compartirán.</p>

          <div class="callout callout-info">
            <strong>CNI en profundidad:</strong> En la siguiente sección vamos a indagar exactamente cómo funciona un plugin CNI: qué es el spec, cómo el runtime lo invoca y qué pasa a nivel de kernel cuando se crea el veth pair.
          </div>

          <h2>Paso 5 — kubelet crea los init containers (si existen)</h2>

          <p>Si el spec tiene <code>initContainers</code>, kubelet los crea y ejecuta en orden, uno por uno. Para cada uno llama a <code>CreateContainer</code> y <code>StartContainer</code> en el CRI, pasando el <code>podSandboxID</code> del paso 3. El init container se une a los namespaces del sandbox (red, IPC, UTS) pero tiene su propio filesystem.</p>

          <p>kubelet espera que cada init container termine con exit 0 antes de pasar al siguiente. Si alguno falla, el Pod queda en <code>Init:Error</code> y kubelet reintenta según <code>restartPolicy</code>.</p>

          <h2>Paso 6 — kubelet crea los contenedores regulares</h2>

          <p>Una vez que todos los init containers completaron, kubelet crea todos los contenedores regulares. Para cada uno:</p>

          <ol>
            <li>Llama a <code>PullImage</code> si la imagen no está en caché</li>
            <li>Llama a <code>CreateContainer</code> con el <code>podSandboxID</code> — el runtime configura el contenedor para que use los namespaces del sandbox</li>
            <li>Llama a <code>StartContainer</code> — el runtime ejecuta <code>runc create</code> + <code>runc start</code></li>
          </ol>

          <p>El proceso arranca con los namespaces del pause (red, IPC, UTS) pero con su propio namespace de PID y su propio OverlayFS.</p>

          <h2>Paso 7 — kubelet empieza a monitorear</h2>

          <p>Con los contenedores corriendo, kubelet entra en su loop de reconciliación: ejecuta los probes configurados (liveness, readiness, startup), reporta el estado al API server, y actúa si algún contenedor muere.</p>

          <h2>Observándolo en vivo</h2>

          <p>Los siete pasos no son una abstracción — cada uno deja huella observable. La forma más confiable y que siempre funciona, sin SSH al nodo, es escuchar los <em>events</em> del API server:</p>

          <pre><code># Terminal A: stream de eventos del cluster
kubectl get events --watch --output-watch-events

# Terminal B: crear el Pod
kubectl run nginx --image=nginx
# pod/nginx created</code></pre>

          <p>En la terminal A van a aparecer los eventos en orden, cada uno con su <code>reason</code> que mapea directo a un paso del flujo:</p>

          <pre><code>EVENT   LAST SEEN  TYPE     REASON      OBJECT      MESSAGE
ADDED   0s         Normal   Scheduled   pod/nginx   Successfully assigned default/nginx to node01
ADDED   0s         Normal   Pulling     pod/nginx   Pulling image "nginx"
ADDED   7s         Normal   Pulled      pod/nginx   Successfully pulled image "nginx" in 7.475s. Image size: 62964342 bytes.
ADDED   7s         Normal   Created     pod/nginx   Created container: nginx
ADDED   8s         Normal   Started     pod/nginx   Started container nginx</code></pre>

          <p><code>Scheduled</code> = paso 1 + 2 (scheduler + kubelet detecta). <code>Pulling</code>/<code>Pulled</code> = <code>PullImage</code> del CRI. <code>Created</code> = <code>CreateContainer</code>. <code>Started</code> = <code>StartContainer</code>. Si la imagen ya está cacheada, <code>Pulled</code> se reporta en milisegundos y los eventos pueden colapsarse a uno solo:</p>

          <pre><code># Segunda creación con la imagen ya en caché del runtime
ADDED   0s         Normal   Pulled      pod/nginx   Successfully pulled image "nginx" in 770ms.
ADDED   0s         Normal   Created     pod/nginx   Created container: nginx
ADDED   0s         Normal   Started     pod/nginx   Started container nginx</code></pre>

          <p>Y al borrar el Pod, el evento <code>Killing</code> revela el comienzo del shutdown (<code>StopContainer</code> del CRI) — kubelet manda SIGTERM y espera <code>terminationGracePeriodSeconds</code> antes de SIGKILL:</p>

          <pre><code>ADDED   0s         Normal   Killing     pod/nginx   Stopping container nginx</code></pre>

          <p>Para verificar el resultado en el nodo, primero averiguá <em>en cuál</em> nodo cayó el Pod y entrá ahí:</p>

          <pre><code># En qué nodo se schedulueó
kubectl get pod nginx -o wide
# NAME    READY   STATUS    NODE     IP
# nginx   1/1     Running   node01   192.168.1.42

# SSH al nodo donde corre y consultar el runtime directamente
ssh node01

# crictl filtra los pod sandboxes — cada entrada es un contenedor pause
crictl pods --name nginx
# POD ID         CREATED        STATE  NAME   NAMESPACE  ATTEMPT  RUNTIME
# 2cc2b0a67a435  2 minutes ago  Ready  nginx  default    0        (default)

# Y los contenedores regulares — la columna IMAGE muestra el SHA del image id,
# no el tag (nginx:latest). Para resolver al nombre: crictl images.
crictl ps --name nginx
# CONTAINER      IMAGE         CREATED        STATE   NAME   ATTEMPT  POD ID         POD    NAMESPACE
# eadc347ef9589  6c3a6ea6608c8 3 minutes ago  Running nginx  0        2cc2b0a67a435  nginx  default

# Listar containers de un Pod específico — OJO: --pod toma el POD ID,
# no el nombre. crictl ps --pod nginx no devuelve nada.
crictl ps --pod 2cc2b0a67a435
# CONTAINER      IMAGE         ... POD ID         POD    NAMESPACE
# eadc347ef9589  6c3a6ea6608c8 ... 2cc2b0a67a435  nginx  default</code></pre>

          <p>Los IDs <code>2cc2b0a67a435...</code> (sandbox) y <code>eadc347ef9589...</code> (container) son lo que devolvieron <code>RunPodSandbox</code> y <code>CreateContainer</code> respectivamente — viven en el estado de containerd y son los mismos que kubelet usa internamente para cualquier operación posterior. Para ir directo al pause sin pasar por kubelet, inspeccioná el sandbox y consultá el PID:</p>

          <pre><code>crictl inspectp 2cc2b0a67a435 | jq '.info.pid'
# 65281

ps 65281
# PID    TTY  STAT  TIME  COMMAND
# 65281  ?    Ss    0:00  /pause</code></pre>

          <p>Confirmación final: el proceso es literalmente <code>/pause</code>, el binario estático de 743 KB cuyo único trabajo es sostener los namespaces del Pod. A partir de ese PID puedes usar <code>nsenter -t 65281 --net</code> para entrar a la red del Pod, o leer <code>/proc/65281/ns/*</code> para ver los inodes de cada namespace que comparte con los containers de aplicación.</p>

          <p>Y si listas todos los sandboxes del nodo, vas a ver no sólo tus Pods de aplicación, sino también los del control plane que viven en cada nodo:</p>

          <pre><code>crictl pods
# POD ID         CREATED         STATE     NAME                       NAMESPACE
# 0b69c25ec6a49  13 seconds ago  Ready     nginx                      default
# 2cac328c5ca49  4 hours ago     Ready     coredns-76bb9b6fb5-ztbtq   kube-system
# 79ecf3b634a17  4 hours ago     Ready     canal-fvthj                kube-system
# bd629edafd590  4 hours ago     Ready     kube-proxy-2slpb           kube-system
# cdcb824d9ed08  3 days ago      NotReady  canal-fvthj                kube-system
# c8c3ad939d519  3 days ago      NotReady  kube-proxy-2slpb           kube-system</code></pre>

          <p>Las entradas <code>NotReady</code> de hace varios días son sandboxes huérfanos: cuando el nodo reinició, los procesos murieron pero los registros en el state de containerd quedaron. <code>crictl rmp --force &lt;id&gt;</code> los limpia si te molestan.</p>

          <div class="callout callout-note">
            <span class="callout-label">Los logs de kubelet en el nodo</span>
            <p><code>journalctl -u kubelet</code> solo funciona en el <strong>nodo donde el Pod se schedulueó</strong>, no en <code>controlplane</code>. Primero <code>kubectl get pod -o wide</code>, después SSH a ese nodo. A verbosidad por defecto (<code>--v=2</code>) vas a ver mensajes del reconciler, del volume manager, y reportes de latencia del lifecycle. Una corrida real de <code>kubectl run nginx</code> seguido de <code>kubectl delete pod nginx</code> deja una huella así:</p>
            <pre><code>sudo journalctl -u kubelet -f --since=now

# CREACIÓN
... reconciler_common.go:251] VerifyControllerAttachedVolume started for
    volume "kube-api-access-4gkdt" ... pod="default/nginx"

# El tracker de latencia del Pod, super útil para perf debugging
... pod_startup_latency_tracker.go:104] "Observed pod startup duration"
    pod="default/nginx" podStartSLOduration=114.296153455
    podStartE2EDuration="2m1.772173421s"
    firstStartedPulling="..." lastFinishedPulling="..."
    observedRunningTime="..."

# BORRADO
... reconciler_common.go:163] UnmountVolume started for volume
    "kube-api-access-4gkdt" pod="..."
... operation_generator.go:781] UnmountVolume.TearDown succeeded ...
... scope.go:117] "RemoveContainer" containerID="9463129534..."

# Race típica e inocua: kubelet pide ContainerStatus de un container que ya
# eliminó. La maneja sola, pero llena los logs con un E0427 una vez:
... E0427 ... ContainerStatus from runtime service failed
    err="rpc error: code = NotFound..." containerID="9463129534..."

... kubelet_volumes.go:163] "Cleaned up orphaned pod volumes dir"
    path="/var/lib/kubelet/pods/&lt;uid&gt;/volumes"</code></pre>
            <p>Tres detalles que vale la pena leer:</p>
            <ul>
              <li><strong><code>VerifyControllerAttachedVolume</code></strong>: kubelet montó el volume <em>proyectado</em> del <code>ServiceAccount</code> token (<code>kube-api-access-XXXX</code>) antes de iniciar el container. Cada Pod recibe automáticamente este volume bajo <code>/var/run/secrets/kubernetes.io/serviceaccount</code> — es lo que las apps usan para hablar con el API server.</li>
              <li><strong><code>pod_startup_latency_tracker.go</code></strong>: el bloque más útil para diagnóstico de performance. Reporta <code>podStartE2EDuration</code> (de creación a Running), <code>firstStartedPulling</code>/<code>lastFinishedPulling</code> (cuánto tomó la image pull), y <code>observedRunningTime</code> (cuándo el container empezó a correr). Para un Pod que tarda 2 minutos en arrancar, este log te dice exactamente dónde se fue el tiempo.</li>
              <li><strong>El <code>E0427 ... ContainerStatus from runtime service failed err="...NotFound..."</code></strong> es una race condition normal y benigna: kubelet pide el status de un container que ya borró en el mismo ciclo. La maneja silenciosamente, pero genera un error log. No te alarmes cuando lo veas durante un delete.</li>
            </ul>
            <p>Las trazas más detalladas (<code>SyncLoop ADD</code>, <code>CRI: RunPodSandbox name=...</code>) requieren subir la verbosidad: editá <code>/var/lib/kubelet/kubeadm-flags.env</code> o el <code>KubeletConfiguration</code>, agregá <code>--v=4</code>, y <code>systemctl restart kubelet</code>. Ruidoso en producción — revertí cuando termines.</p>
          </div>

          <div class="callout callout-info">
            <strong>El flujo completo:</strong>
            <pre style="margin-top:0.5rem;margin-bottom:0">kubectl apply
  → API server guarda el Pod en etcd (nodeName: "")
  → scheduler asigna nodeName
  → kubelet detecta el Pod
  → CRI: RunPodSandbox       → pause container + namespaces
  → CNI plugin               → IP asignada al namespace
  → CRI: CreateContainer × N → contenedores se unen al sandbox
  → CRI: StartContainer × N  → procesos arrancados con runc
  → kubelet loop             → probes + reporte de estado</pre>
          </div>
        `,
  en: `
          <p>So far we have seen the pieces: the pause container, namespaces, the filesystem. But what triggers all of that? Who calls whom and in what order? This part follows the exact path from the moment the user runs <code>kubectl apply</code> to the Pod running.</p>

          <h2>Step 1 — The scheduler assigns the Pod to a node</h2>

          <p>When you create a Pod, the API server saves it in etcd with <code>nodeName: ""</code>. The scheduler detects it, evaluates which node has available resources, and updates the Pod's <code>nodeName</code> field with the chosen node. From that point on the scheduler is no longer involved.</p>

          <h2>Step 2 — kubelet detects the Pod</h2>

          <p>kubelet runs on every node and has a watch open against the API server. As soon as the Pod is assigned to its node, kubelet receives it and begins the creation process.</p>

          <h2>Step 3 — kubelet calls the CRI</h2>

          <p>kubelet does not talk directly to containerd or runc. It talks to the CRI (Container Runtime Interface), a standard gRPC API that abstracts the runtime. The contract is defined in <a href="https://github.com/kubernetes/cri-api/blob/master/pkg/apis/runtime/v1/api.proto" target="_blank" rel="noopener noreferrer">api.proto</a> as a gRPC service:</p>

          <pre><code>// api.proto — kubernetes/cri-api
service RuntimeService {
  rpc RunPodSandbox(RunPodSandboxRequest)   returns (RunPodSandboxResponse) {}
  rpc CreateContainer(CreateContainerRequest) returns (CreateContainerResponse) {}
  rpc StartContainer(StartContainerRequest)   returns (StartContainerResponse) {}
  rpc StopContainer(StopContainerRequest)     returns (StopContainerResponse) {}
  rpc RemovePodSandbox(RemovePodSandboxRequest) returns (RemovePodSandboxResponse) {}
  rpc Exec(ExecRequest)                       returns (ExecResponse) {}
  rpc Attach(AttachRequest)                   returns (AttachResponse) {}
  rpc PortForward(PortForwardRequest)         returns (PortForwardResponse) {}
  // ...
}</code></pre>

          <p>Each <code>rpc</code> line defines a remote method: the name, the input message type, and the response message type — both also defined in the same proto:</p>

          <pre><code>message RunPodSandboxRequest {
  PodSandboxConfig config = 1;  // sandbox spec: namespaces, hostname, dns...
  string runtime_handler = 2;  // "runc", "kata-containers", etc.
}

message RunPodSandboxResponse {
  string pod_sandbox_id = 1;   // ID kubelet will use in CreateContainer
}</code></pre>

          <p>kubelet serializes the request to binary protobuf and sends it over a Unix socket using HTTP/2. On the other side, containerd deserializes it and executes the operation. The actual implementation of <code>RunPodSandbox</code> in containerd lives in <a href="https://github.com/containerd/containerd/blob/main/internal/cri/server/sandbox_run.go" target="_blank" rel="noopener noreferrer">internal/cri/server/sandbox_run.go</a>:</p>

          <pre><code>// containerd — sandbox_run.go
func (c *criService) RunPodSandbox(
  ctx context.Context,
  r *runtime.RunPodSandboxRequest,
) (_ *runtime.RunPodSandboxResponse, retErr error) { ... }</code></pre>

          <p>What makes this design elegant is that kubelet has no idea what is on the other side — it only knows the protobuf contract. Switching from containerd to CRI-O is just a matter of changing which process listens on the <code>/run/containerd/containerd.sock</code> socket.</p>

          <p>The first call is <code>RunPodSandbox</code>, which creates the Pod sandbox — the pause container:</p>

          <pre><code>kubelet → CRI (containerd) → RunPodSandbox(config)</code></pre>

          <p>The runtime:</p>

          <ul>
            <li>Downloads the <code>registry.k8s.io/pause</code> image if not cached</li>
            <li>Creates the Pod's namespaces: net, IPC, UTS</li>
            <li>Starts the <code>/pause</code> process</li>
            <li>Returns a <code>podSandboxID</code></li>
          </ul>

          <h2>Step 4 — the CNI plugin configures networking</h2>

          <p>Immediately after creating the sandbox, the runtime invokes the CNI plugin configured on the node (Calico, Flannel, Cilium, etc.). The plugin receives the pause's network namespace and:</p>

          <ul>
            <li>Creates a veth pair: one interface inside the Pod namespace (<code>eth0</code>), one on the host (<code>cali...</code> or <code>veth...</code>)</li>
            <li>Assigns the Pod's IP to <code>eth0</code></li>
            <li>Configures the necessary routes</li>
          </ul>

          <p>From this point the Pod has an IP address. That IP belongs to the pause's network namespace — all containers that join that namespace will share it.</p>

          <div class="callout callout-info">
            <strong>CNI in depth:</strong> In the next section we will dig into exactly how a CNI plugin works: what the spec defines, how the runtime invokes it, and what happens at the kernel level when the veth pair is created.
          </div>

          <h2>Step 5 — kubelet creates init containers (if any)</h2>

          <p>If the spec has <code>initContainers</code>, kubelet creates and runs them in order, one by one. For each one it calls <code>CreateContainer</code> and <code>StartContainer</code> on the CRI, passing the <code>podSandboxID</code> from step 3. The init container joins the sandbox namespaces (net, IPC, UTS) but has its own filesystem.</p>

          <p>kubelet waits for each init container to exit with code 0 before moving to the next. If one fails, the Pod stays in <code>Init:Error</code> and kubelet retries according to <code>restartPolicy</code>.</p>

          <h2>Step 6 — kubelet creates the regular containers</h2>

          <p>Once all init containers have completed, kubelet creates all regular containers. For each one:</p>

          <ol>
            <li>Calls <code>PullImage</code> if the image is not cached</li>
            <li>Calls <code>CreateContainer</code> with the <code>podSandboxID</code> — the runtime configures the container to use the sandbox's namespaces</li>
            <li>Calls <code>StartContainer</code> — the runtime runs <code>runc create</code> + <code>runc start</code></li>
          </ol>

          <p>The process starts with the pause's namespaces (net, IPC, UTS) but with its own PID namespace and its own OverlayFS.</p>

          <h2>Step 7 — kubelet starts monitoring</h2>

          <p>With the containers running, kubelet enters its reconciliation loop: it runs the configured probes (liveness, readiness, startup), reports state to the API server, and acts if any container dies.</p>

          <h2>Watching it live</h2>

          <p>The seven steps are not an abstraction — each one leaves an observable trace. The most reliable way to follow them, with no SSH to a node, is to listen to the API server's <em>events</em>:</p>

          <pre><code># Terminal A: stream cluster events
kubectl get events --watch --output-watch-events

# Terminal B: create the Pod
kubectl run nginx --image=nginx
# pod/nginx created</code></pre>

          <p>On terminal A the events stream in order, each with a <code>reason</code> that maps directly to a step in the flow:</p>

          <pre><code>EVENT   LAST SEEN  TYPE     REASON      OBJECT      MESSAGE
ADDED   0s         Normal   Scheduled   pod/nginx   Successfully assigned default/nginx to node01
ADDED   0s         Normal   Pulling     pod/nginx   Pulling image "nginx"
ADDED   7s         Normal   Pulled      pod/nginx   Successfully pulled image "nginx" in 7.475s. Image size: 62964342 bytes.
ADDED   7s         Normal   Created     pod/nginx   Created container: nginx
ADDED   8s         Normal   Started     pod/nginx   Started container nginx</code></pre>

          <p><code>Scheduled</code> = step 1 + 2 (scheduler + kubelet detects). <code>Pulling</code>/<code>Pulled</code> = the CRI's <code>PullImage</code>. <code>Created</code> = <code>CreateContainer</code>. <code>Started</code> = <code>StartContainer</code>. If the image is already cached, <code>Pulled</code> reports in milliseconds and the events may collapse to a tight cluster:</p>

          <pre><code># Second creation, image already in the runtime cache
ADDED   0s         Normal   Pulled      pod/nginx   Successfully pulled image "nginx" in 770ms.
ADDED   0s         Normal   Created     pod/nginx   Created container: nginx
ADDED   0s         Normal   Started     pod/nginx   Started container nginx</code></pre>

          <p>And on Pod deletion, the <code>Killing</code> event marks the start of shutdown (the CRI's <code>StopContainer</code>) — kubelet sends SIGTERM and waits <code>terminationGracePeriodSeconds</code> before SIGKILL:</p>

          <pre><code>ADDED   0s         Normal   Killing     pod/nginx   Stopping container nginx</code></pre>

          <p>To verify the result on the node, first find out <em>which</em> node the Pod landed on and SSH there:</p>

          <pre><code># Which node was it scheduled on?
kubectl get pod nginx -o wide
# NAME    READY   STATUS    NODE     IP
# nginx   1/1     Running   node01   192.168.1.42

# SSH to that node and query the runtime directly
ssh node01

# crictl filters out pod sandboxes — each entry is a pause container
crictl pods --name nginx
# POD ID         CREATED        STATE  NAME   NAMESPACE  ATTEMPT  RUNTIME
# 2cc2b0a67a435  2 minutes ago  Ready  nginx  default    0        (default)

# And the regular containers — the IMAGE column shows the image id SHA,
# not the tag (nginx:latest). To resolve to a name: crictl images.
crictl ps --name nginx
# CONTAINER      IMAGE         CREATED        STATE   NAME   ATTEMPT  POD ID         POD    NAMESPACE
# eadc347ef9589  6c3a6ea6608c8 3 minutes ago  Running nginx  0        2cc2b0a67a435  nginx  default

# List containers in a specific Pod — NOTE: --pod takes the POD ID,
# not the name. crictl ps --pod nginx returns nothing.
crictl ps --pod 2cc2b0a67a435
# CONTAINER      IMAGE         ... POD ID         POD    NAMESPACE
# eadc347ef9589  6c3a6ea6608c8 ... 2cc2b0a67a435  nginx  default</code></pre>

          <p>The <code>2cc2b0a67a435...</code> (sandbox) and <code>eadc347ef9589...</code> (container) IDs are exactly what <code>RunPodSandbox</code> and <code>CreateContainer</code> returned — they live in containerd's state and are the same IDs kubelet uses internally for any later operation. To skip kubelet entirely and go straight to the pause, inspect the sandbox and read the PID:</p>

          <pre><code>crictl inspectp 2cc2b0a67a435 | jq '.info.pid'
# 65281

ps 65281
# PID    TTY  STAT  TIME  COMMAND
# 65281  ?    Ss    0:00  /pause</code></pre>

          <p>Final confirmation: the process is literally <code>/pause</code>, the 743 KB static binary whose only job is to hold the Pod's namespaces. From that PID you can use <code>nsenter -t 65281 --net</code> to enter the Pod's network, or read <code>/proc/65281/ns/*</code> to see the inodes of every namespace it shares with the application containers.</p>

          <p>And if you list every sandbox on the node, you'll see not only your application Pods but also the control-plane components that live on each node:</p>

          <pre><code>crictl pods
# POD ID         CREATED         STATE     NAME                       NAMESPACE
# 0b69c25ec6a49  13 seconds ago  Ready     nginx                      default
# 2cac328c5ca49  4 hours ago     Ready     coredns-76bb9b6fb5-ztbtq   kube-system
# 79ecf3b634a17  4 hours ago     Ready     canal-fvthj                kube-system
# bd629edafd590  4 hours ago     Ready     kube-proxy-2slpb           kube-system
# cdcb824d9ed08  3 days ago      NotReady  canal-fvthj                kube-system
# c8c3ad939d519  3 days ago      NotReady  kube-proxy-2slpb           kube-system</code></pre>

          <p>The <code>NotReady</code> entries from days ago are orphaned sandboxes: when the node restarted, the processes died but the records in containerd's state stayed behind. <code>crictl rmp --force &lt;id&gt;</code> cleans them up if they bother you.</p>

          <div class="callout callout-note">
            <span class="callout-label">kubelet logs on the node</span>
            <p><code>journalctl -u kubelet</code> only works on the <strong>node where the Pod was scheduled</strong>, not on <code>controlplane</code>. First <code>kubectl get pod -o wide</code>, then SSH to that node. At default verbosity (<code>--v=2</code>) you'll see reconciler messages, volume-manager events, and lifecycle latency reports. A real run of <code>kubectl run nginx</code> followed by <code>kubectl delete pod nginx</code> leaves a footprint like:</p>
            <pre><code>sudo journalctl -u kubelet -f --since=now

# CREATION
... reconciler_common.go:251] VerifyControllerAttachedVolume started for
    volume "kube-api-access-4gkdt" ... pod="default/nginx"

# The Pod startup latency tracker — gold for performance debugging
... pod_startup_latency_tracker.go:104] "Observed pod startup duration"
    pod="default/nginx" podStartSLOduration=114.296153455
    podStartE2EDuration="2m1.772173421s"
    firstStartedPulling="..." lastFinishedPulling="..."
    observedRunningTime="..."

# DELETION
... reconciler_common.go:163] UnmountVolume started for volume
    "kube-api-access-4gkdt" pod="..."
... operation_generator.go:781] UnmountVolume.TearDown succeeded ...
... scope.go:117] "RemoveContainer" containerID="9463129534..."

# Typical harmless race: kubelet asks ContainerStatus for a container it
# already removed. Handled silently, but it logs an E0427 once:
... E0427 ... ContainerStatus from runtime service failed
    err="rpc error: code = NotFound..." containerID="9463129534..."

... kubelet_volumes.go:163] "Cleaned up orphaned pod volumes dir"
    path="/var/lib/kubelet/pods/&lt;uid&gt;/volumes"</code></pre>
            <p>Three details worth reading:</p>
            <ul>
              <li><strong><code>VerifyControllerAttachedVolume</code></strong>: kubelet mounted the <em>projected</em> volume that holds the <code>ServiceAccount</code> token (<code>kube-api-access-XXXX</code>) before starting the container. Every Pod automatically gets this volume at <code>/var/run/secrets/kubernetes.io/serviceaccount</code> — that's what apps use to talk to the API server.</li>
              <li><strong><code>pod_startup_latency_tracker.go</code></strong>: the most useful block for performance diagnosis. It reports <code>podStartE2EDuration</code> (creation to Running), <code>firstStartedPulling</code>/<code>lastFinishedPulling</code> (image pull duration), and <code>observedRunningTime</code> (when the container actually started running). For a Pod that takes 2 minutes to start, this log tells you exactly where the time went.</li>
              <li><strong>The <code>E0427 ... ContainerStatus from runtime service failed err="...NotFound..."</code></strong> is a normal, benign race: kubelet asks for the status of a container it already removed in the same cycle. It handles it silently, but it surfaces an error log. Don't be alarmed when you see it during a delete.</li>
            </ul>
            <p>The deeper traces (<code>SyncLoop ADD</code>, <code>CRI: RunPodSandbox name=...</code>) require bumping verbosity: edit <code>/var/lib/kubelet/kubeadm-flags.env</code> or the <code>KubeletConfiguration</code>, add <code>--v=4</code>, then <code>systemctl restart kubelet</code>. Noisy in production — revert when done.</p>
          </div>

          <div class="callout callout-info">
            <strong>The complete flow:</strong>
            <pre style="margin-top:0.5rem;margin-bottom:0">kubectl apply
  → API server saves the Pod in etcd (nodeName: "")
  → scheduler assigns nodeName
  → kubelet detects the Pod
  → CRI: RunPodSandbox       → pause container + namespaces
  → CNI plugin               → IP assigned to the namespace
  → CRI: CreateContainer × N → containers join the sandbox
  → CRI: StartContainer × N  → processes started with runc
  → kubelet loop             → probes + state reporting</pre>
          </div>
        `,
}
