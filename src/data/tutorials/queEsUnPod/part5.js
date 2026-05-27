export default {
  es: `
          <p>Un plugin CNI no es un servicio ni un daemon. Es un binario ejecutable. Cuando el runtime necesita configurar la red de un Pod, simplemente corre ese binario, le pasa el contexto por variables de entorno y un JSON por stdin, y espera el resultado en stdout. Sin servidor, sin socket, sin protocolo largo — solo un proceso que arranca, configura la red y termina.</p>

          <p>Eso es lo que define el <a href="https://github.com/containernetworking/cni/blob/main/SPEC.md" target="_blank" rel="noopener noreferrer">spec de CNI</a>.</p>

          <h2>El protocolo</h2>

          <p>El runtime invoca el plugin con estas variables de entorno y un JSON por stdin:</p>

          <pre><code>CNI_COMMAND=ADD
CNI_CONTAINERID=&lt;pod-sandbox-id&gt;
CNI_NETNS=/proc/&lt;pause-pid&gt;/ns/net   # el network namespace del pause
CNI_IFNAME=eth0                       # nombre de la interfaz dentro del Pod
CNI_PATH=/opt/cni/bin                 # donde están los binarios de plugins

# stdin:
{
  "cniVersion": "1.0.0",
  "name": "k8s-pod-network",
  "type": "calico",
  ...
}</code></pre>

          <p>El plugin lee esas variables, entra al namespace de red del pause, crea las interfaces, y responde con un JSON en stdout que incluye la IP asignada:</p>

          <pre><code>{
  "ips": [{ "address": "10.244.1.42/24", "gateway": "10.244.1.1" }],
  "interfaces": [{ "name": "eth0", "sandbox": "/proc/12345/ns/net" }]
}</code></pre>

          <h2>Lo que pasa a nivel de kernel: el veth pair</h2>

          <p>Un <a href="/tutorial/que-es-realmente-un-contenedor/namespaces#5-net-network-namespace">veth (virtual ethernet)</a> es un par de interfaces de red virtuales conectadas entre sí — lo que entra por una sale por la otra. El plugin crea el par en estos pasos:</p>

          <ol>
            <li>Crea el par: <code>cali...</code> (Calico) o <code>veth...</code> (Flannel/CNI bridge) en el host y <code>eth0</code> en el namespace del pause</li>
            <li>Asigna la IP del Pod a <code>eth0</code></li>
            <li>Mueve un extremo del par al namespace de red del pause</li>
            <li>El otro extremo queda en el host. Qué se hace con él depende del plugin: Calico no usa bridge — agrega una <em>route</em> /32 al kernel del host hacia ese veth; Flannel y el plugin <code>bridge</code> sí enganchan el extremo del host a un bridge Linux como <code>cni0</code></li>
          </ol>

          <p>En un cluster Calico (lo que probablemente tengas en producción) los nombres de las interfaces empiezan con <code>cali</code> y la MAC es siempre <code>ee:ee:ee:ee:ee:ee</code> — un sentinel obvio. En el nodo donde corren los Pods:</p>

          <pre><code># Listar los veth pairs activos
ip link show type veth
# 7:  cali5711bd63df3@if3: &lt;BROADCAST,MULTICAST,UP,LOWER_UP&gt; mtu 1450 ...
#     link/ether ee:ee:ee:ee:ee:ee brd ff:ff:ff:ff:ff:ff
#     link-netns cni-bd440fff-41f5-f359-dafd-9f642711c2ac
# 8:  cali55c35b9056b@if3: ... link-netns cni-5dcc03a5-...
# 9:  calic440f455693@if3: ... link-netns cni-332eed28-...
# 12: cali12d4a061371@if3: ... link-netns cni-05cf3530-...</code></pre>

          <p>Cada <code>cali*</code> es el extremo host de un veth pair; el otro extremo (<code>eth0</code>) vive en el netns del Pod referenciado por <code>link-netns cni-...</code>. La cuenta da: cuatro veth en este nodo = cuatro Pods con red.</p>

          <div class="callout callout-warning">
            <strong>Trampita: <code>kubectl exec nginx -- ip addr</code> falla.</strong> La imagen oficial de <code>nginx</code> no trae <code>iproute2</code>:
            <pre><code>kubectl exec nginx -- ip addr show eth0
# error: exec failed: "ip": executable file not found in $PATH</code></pre>
            Soluciones: usar una imagen con tools (<code>busybox</code>, <code>alpine</code>), o entrar al netns desde el host con <code>nsenter</code> (lo cubrimos abajo). Para una mirada rápida desde la red del Pod:
            <pre><code>kubectl run busybox --image=busybox --command -- sleep 600
kubectl exec busybox -- ip addr show eth0
# 3: eth0@if12: &lt;BROADCAST,MULTICAST,UP,LOWER_UP&gt; mtu 1450
#     link/ether 02:6f:a0:c8:df:19 brd ff:ff:ff:ff:ff:ff
#     inet 192.168.1.7/32 scope global eth0</code></pre>
          </div>

          <p>El <code>@if12</code> dentro del Pod y el <code>link-netns cni-...</code> del lado host son punteros recíprocos — el kernel los usa para indicar "este veth está pareado con la interfaz 12 en aquel namespace". El MTU 1450 (en lugar de 1500) refleja el overhead de VXLAN.</p>

          <p>A partir de ese momento, cualquier paquete que salga del Pod por <code>eth0</code> llega al host por el <code>cali...</code>, y viceversa. Todos los contenedores del Pod comparten esa misma IP porque todos viven en el mismo network namespace, que tiene una sola <code>eth0</code>.</p>

          <h3>Same-node vs cross-node: la ruta cambia</h3>

          <p>Cómo el host enruta tráfico hacia una IP de Pod depende de si el Pod corre <em>en este nodo</em> o <em>en otro</em>:</p>

          <pre><code># Caso A: el Pod corre en este mismo nodo
# El kernel tiene una /32 directa al cali del Pod
ip route get 192.168.1.7   # ejecutado en node01 donde corre busybox
# 192.168.1.7 dev cali12d4a061371 src 172.30.2.2 uid 0
#                       ↑ ruta /32 al veth — sin bridge
#                                          ↑ src = IP primaria del host (eth0 del nodo)

# Caso B: el Pod corre en OTRO nodo (cross-node)
# El paquete sale por flannel.1, el túnel VXLAN
ip route get 192.168.1.7   # ejecutado en controlplane (busybox vive en node01)
# 192.168.1.7 via 192.168.1.0 dev flannel.1 src 192.168.0.0 uid 0
#                                ↑ flannel encapsula y manda al otro nodo
#                                                       ↑ src = IP del nodo en el Pod CIDR</code></pre>

          <p>Notá la diferencia en <code>src</code>: en mismo-nodo el kernel responde con la IP primaria del host (<code>172.30.2.2</code>, la real <code>eth0</code> del nodo); cross-node usa una IP dentro del Pod CIDR (<code>192.168.0.0</code>, asignada al endpoint local del túnel <code>flannel.1</code>). Es la huella de que el paquete cross-node no sale por la red física del nodo sino encapsulado en un VXLAN cuyo origen aparente es el endpoint del túnel.</p>

          <p>Esto te dice algo concreto sobre la arquitectura del cluster: <strong>no es Calico puro</strong>. Es <a href="https://docs.tigera.io/calico/latest/getting-started/kubernetes/flannel/install-for-flannel" target="_blank" rel="noopener"><strong>canal</strong></a> — Calico para policy enforcement, Flannel para el data plane (VXLAN). Es el <code>canal-fvthj</code> que viste en <a href="/tutorial/que-es-un-pod/como-kubelet-crea-un-pod">la parte 4</a>. En Calico puro con BGP el cross-node iría por una ruta directa al peer, no por un túnel.</p>

          <p>Para inspeccionar la red del Pod sin pasar por <code>kubectl exec</code> (útil cuando el container no tiene <code>ip</code> instalado), entrá al netns desde el host:</p>

          <pre><code># Obtener el PID del pause.
# OJO: 'inspectp' (con p) para sandboxes; 'inspect' es para containers
# y devolverá NotFound si le pasas un pod ID.
PAUSE_PID=$(crictl inspectp $(crictl pods --name nginx -q) | jq '.info.pid')
echo \${PAUSE_PID}
# 67623   ← PID real del proceso /pause en el host

# Ejecutar comandos del host dentro del netns del Pod
sudo nsenter -t \${PAUSE_PID} --net ip addr
# 1: lo: &lt;LOOPBACK,UP&gt; mtu 65536 ...
# 3: eth0@if9: &lt;BROADCAST,MULTICAST,UP,LOWER_UP&gt; mtu 1450
#     link/ether 9e:8d:bc:bf:c9:81 brd ff:ff:ff:ff:ff:ff link-netnsid 0
#     inet 192.168.1.4/32 scope global eth0

sudo nsenter -t \${PAUSE_PID} --net ss -tlnp
# State   Local Address:Port    Process
# LISTEN  0.0.0.0:80            users:(("nginx",pid=67656,fd=6),("nginx",pid=67623,fd=6))
# LISTEN  [::]:80               users:(("nginx",pid=67656,fd=7),("nginx",pid=67623,fd=7))</code></pre>

          <p>Lo que ves en el output del <code>ss</code> son los procesos <em>nginx</em> de la app — el pause no escucha en ningún puerto (es solo el dueño del namespace, no atiende tráfico). De hecho, si repites el ejercicio con un Pod de busybox que solo duerme, <code>ss -tlnp</code> sale vacío: el namespace existe pero no hay nada escuchando.</p>

          <h2>Cómo containerd llama al CNI</h2>

          <p>containerd usa la librería <a href="https://github.com/containerd/go-cni" target="_blank" rel="noopener noreferrer">go-cni</a> que carga la configuración desde <code>/etc/cni/net.d/</code> y ejecuta los binarios desde <code>/opt/cni/bin/</code>. En <a href="https://github.com/containerd/containerd/blob/main/internal/cri/server/sandbox_run.go" target="_blank" rel="noopener noreferrer">sandbox_run.go</a> la llamada ocurre en <code>setupPodNetwork()</code> justo después de que el sandbox está creado:</p>

          <pre><code># Los archivos relevantes en el nodo
ls /etc/cni/net.d/
# 10-canal.conflist          ← config CNI activa: Canal (Calico + Flannel)
# 87-podman-bridge.conflist  ← bridge propio de podman, no lo usa k8s
# calico-kubeconfig          ← kubeconfig que los pods de Calico usan
#                              para hablar con el API server

ls -lh /opt/cni/bin/
# total 257M
# -rwsr-xr-x  56M  Apr 24 20:18  calico              ← setuid: necesita CAP_*
# -rwsr-xr-x  56M  Apr 24 20:18  calico-ipam         ← setuid: gestiona IPs
# -rwsr-xr-x  56M  Apr 24 20:18  install             ← setuid: helper de install
# -rwxr-xr-x 5.5M  Aug 28  2025  bridge              ← reference plugin
# -rwxr-xr-x 3.1M  Apr 24 20:18  host-local          ← reference IPAM
# -rwxr-xr-x 3.2M  Apr 24 20:18  loopback
# -rwxr-xr-x 2.4M  Apr 24 20:18  flannel             ← Calico instala flannel
# -rwxr-xr-x 3.7M  Apr 24 20:18  bandwidth           ← traffic shaping
# -rwxr-xr-x 3.6M  Aug 28  2025  portmap             ← hostPort →iptables
# ... 17 binarios más (dhcp, dummy, firewall, host-device, ipvlan, macvlan,
#                     ptp, sbr, static, tap, tuning, vlan, vrf, ...)</code></pre>

          <p>Tres detalles operativos que vale la pena leer:</p>

          <ul>
            <li><strong>El setuid bit (<code>-rwsr-xr-x</code>) en <code>calico</code>, <code>calico-ipam</code> y <code>install</code></strong>: estos binarios necesitan capabilities elevadas (<code>CAP_NET_ADMIN</code>, <code>CAP_SYS_ADMIN</code>) para crear interfaces, modificar tablas de routing y entrar a netns. El runtime los invoca como root, pero el setuid los blindea ante invocaciones que perdieron privilegios en el camino.</li>
            <li><strong>56 MB por binario en <code>calico*</code></strong>: son binarios Go compilados estáticamente, con todas las dependencias vendoreadas (libcalico, gobgp, etcd client, etc.). Comparalos con los <a href="#los-plugins-de-referencia">reference plugins</a> de <code>containernetworking/plugins</code> que pesan 3-5 MB porque hacen mucho menos.</li>
            <li><strong><code>flannel</code> está presente aunque corramos Calico</strong>: el <a href="https://docs.tigera.io/calico/latest/getting-started/kubernetes/helm" target="_blank" rel="noopener">chart oficial de Calico</a> (alojado en <a href="https://github.com/projectcalico/calico/tree/master/charts/tigera-operator" target="_blank" rel="noopener"><code>charts/tigera-operator</code></a>) instala <em>todos</em> los binarios CNI estándar para soportar el modo <a href="https://docs.tigera.io/calico/latest/getting-started/kubernetes/flannel/install-for-flannel" target="_blank" rel="noopener">Calico-on-Flannel (canal)</a> y configuraciones híbridas. Cuál se invoca lo decide el conflist activo (<code>10-canal.conflist</code> en este cluster).</li>
          </ul>

          <h2>Los plugins de referencia</h2>

          <p>El repositorio <a href="https://github.com/containernetworking/plugins#plugins-supplied" target="_blank" rel="noopener">containernetworking/plugins</a> mantiene las implementaciones de referencia, agrupadas en cuatro categorías: <strong>Main</strong> (creación de interfaces — <code>bridge</code>, <code>ipvlan</code>, <code>macvlan</code>, <code>ptp</code>, <code>vlan</code>, <code>host-device</code>, <code>dummy</code>, <code>loopback</code>), <strong>Windows</strong> (<code>win-bridge</code>, <code>win-overlay</code>), <strong>IPAM</strong> (asignación de IPs — <code>host-local</code>, <code>dhcp</code>, <code>static</code>) y <strong>Meta</strong> (<code>tuning</code>, <code>portmap</code>, <code>bandwidth</code>, <code>sbr</code>, <code>firewall</code>).</p>

          <p>Mostramos una muestra mínima — los cuatro que aparecen en cualquier configuración básica de Kubernetes. La <a href="https://github.com/containernetworking/plugins#plugins-supplied" target="_blank" rel="noopener">lista completa con descripciones</a> está en el README del repo:</p>

          <table>
            <thead>
              <tr><th>Plugin</th><th>Tipo</th><th>Qué hace</th></tr>
            </thead>
            <tbody>
              <tr><td><code>bridge</code></td><td>Main</td><td>Conecta el Pod a un bridge Linux en el host</td></tr>
              <tr><td><code>loopback</code></td><td>Main</td><td>Configura la interfaz <code>lo</code> dentro del Pod</td></tr>
              <tr><td><code>host-local</code></td><td>IPAM</td><td>Asigna IPs desde un rango por archivo local</td></tr>
              <tr><td><code>dhcp</code></td><td>IPAM</td><td>Obtiene IP via DHCP</td></tr>
            </tbody>
          </table>

          <p>Calico, Flannel y Cilium son plugins más complejos que construyen sobre estos mismos principios — siguen el mismo protocolo de variables de entorno y stdin/stdout, pero con lógica adicional para routing entre nodos, políticas de red y observabilidad.</p>
        `,
  en: `
          <p>A CNI plugin is not a service or a daemon. It is an executable binary. When the runtime needs to configure a Pod's network, it simply runs that binary, passes the context via environment variables and a JSON on stdin, and waits for the result on stdout. No server, no socket, no long-running protocol — just a process that starts, configures the network, and exits.</p>

          <p>That is what the <a href="https://github.com/containernetworking/cni/blob/main/SPEC.md" target="_blank" rel="noopener noreferrer">CNI spec</a> defines.</p>

          <h2>The protocol</h2>

          <p>The runtime invokes the plugin with these environment variables and a JSON on stdin:</p>

          <pre><code>CNI_COMMAND=ADD
CNI_CONTAINERID=&lt;pod-sandbox-id&gt;
CNI_NETNS=/proc/&lt;pause-pid&gt;/ns/net   # the pause's network namespace
CNI_IFNAME=eth0                       # interface name inside the Pod
CNI_PATH=/opt/cni/bin                 # where the plugin binaries live

# stdin:
{
  "cniVersion": "1.0.0",
  "name": "k8s-pod-network",
  "type": "calico",
  ...
}</code></pre>

          <p>The plugin reads those variables, enters the pause's network namespace, creates the interfaces, and responds with a JSON on stdout containing the assigned IP:</p>

          <pre><code>{
  "ips": [{ "address": "10.244.1.42/24", "gateway": "10.244.1.1" }],
  "interfaces": [{ "name": "eth0", "sandbox": "/proc/12345/ns/net" }]
}</code></pre>

          <h2>What happens at the kernel level: the veth pair</h2>

          <p>A <a href="/tutorial/que-es-realmente-un-contenedor/namespaces#5-net-network-namespace">veth (virtual ethernet)</a> is a pair of virtual network interfaces connected to each other — what goes in one comes out the other. The plugin creates the pair in these steps:</p>

          <ol>
            <li>Creates the pair: <code>cali...</code> (Calico) or <code>veth...</code> (Flannel / CNI bridge) on the host and <code>eth0</code> in the pause's namespace</li>
            <li>Assigns the Pod's IP to <code>eth0</code></li>
            <li>Moves one end of the pair into the pause's network namespace</li>
            <li>The other end stays on the host. What happens with it depends on the plugin: Calico does not use a bridge — it adds a /32 host route to the kernel pointing at that veth; Flannel and the <code>bridge</code> plugin do attach the host end to a Linux bridge such as <code>cni0</code></li>
          </ol>

          <p>On a Calico cluster (likely your production setup) interface names start with <code>cali</code> and the MAC is always <code>ee:ee:ee:ee:ee:ee</code> — an obvious sentinel. On the node where the Pods run:</p>

          <pre><code># List active veth pairs
ip link show type veth
# 7:  cali5711bd63df3@if3: &lt;BROADCAST,MULTICAST,UP,LOWER_UP&gt; mtu 1450 ...
#     link/ether ee:ee:ee:ee:ee:ee brd ff:ff:ff:ff:ff:ff
#     link-netns cni-bd440fff-41f5-f359-dafd-9f642711c2ac
# 8:  cali55c35b9056b@if3: ... link-netns cni-5dcc03a5-...
# 9:  calic440f455693@if3: ... link-netns cni-332eed28-...
# 12: cali12d4a061371@if3: ... link-netns cni-05cf3530-...</code></pre>

          <p>Each <code>cali*</code> is the host end of a veth pair; the other end (<code>eth0</code>) lives in the Pod netns referenced by <code>link-netns cni-...</code>. The math checks out: four veth on this node = four Pods with networking.</p>

          <div class="callout callout-warning">
            <strong>Gotcha: <code>kubectl exec nginx -- ip addr</code> fails.</strong> The official <code>nginx</code> image does not ship <code>iproute2</code>:
            <pre><code>kubectl exec nginx -- ip addr show eth0
# error: exec failed: "ip": executable file not found in $PATH</code></pre>
            Workarounds: use an image with tools (<code>busybox</code>, <code>alpine</code>), or enter the netns from the host with <code>nsenter</code> (covered below). For a quick look from inside the Pod's network:
            <pre><code>kubectl run busybox --image=busybox --command -- sleep 600
kubectl exec busybox -- ip addr show eth0
# 3: eth0@if12: &lt;BROADCAST,MULTICAST,UP,LOWER_UP&gt; mtu 1450
#     link/ether 02:6f:a0:c8:df:19 brd ff:ff:ff:ff:ff:ff
#     inet 192.168.1.7/32 scope global eth0</code></pre>
          </div>

          <p>The <code>@if12</code> inside the Pod and the host-side <code>link-netns cni-...</code> are reciprocal pointers — the kernel uses them to say "this veth is paired with interface 12 in that namespace". The MTU 1450 (instead of 1500) reflects VXLAN overhead.</p>

          <p>From that point on, any packet leaving the Pod through <code>eth0</code> arrives at the host through the <code>cali...</code>, and vice versa. All containers in a Pod share the same IP because they all live in the same network namespace, which has a single <code>eth0</code>.</p>

          <h3>Same-node vs cross-node: the route changes</h3>

          <p>How the host routes traffic to a Pod IP depends on whether the Pod runs <em>on this node</em> or <em>on another</em>:</p>

          <pre><code># Case A: the Pod runs on this same node
# The kernel has a /32 route directly to the Pod's cali
ip route get 192.168.1.7   # run on node01, where busybox lives
# 192.168.1.7 dev cali12d4a061371 src 172.30.2.2 uid 0
#                       ↑ /32 route to the veth — no bridge
#                                          ↑ src = host's primary IP (the node's eth0)

# Case B: the Pod runs on ANOTHER node (cross-node)
# Traffic exits via flannel.1, the VXLAN tunnel
ip route get 192.168.1.7   # run on controlplane (busybox lives on node01)
# 192.168.1.7 via 192.168.1.0 dev flannel.1 src 192.168.0.0 uid 0
#                                ↑ flannel encapsulates and ships to the other node
#                                                       ↑ src = node's IP inside the Pod CIDR</code></pre>

          <p>Notice the difference in <code>src</code>: on the same node the kernel answers with the host's primary IP (<code>172.30.2.2</code>, the node's real <code>eth0</code>); cross-node uses an IP inside the Pod CIDR (<code>192.168.0.0</code>, assigned to the local endpoint of the <code>flannel.1</code> tunnel). It is the fingerprint that the cross-node packet does not leave through the node's physical network but encapsulated inside a VXLAN whose apparent source is the tunnel endpoint.</p>

          <p>This tells you something concrete about the cluster's architecture: <strong>it is not pure Calico</strong>. It is <a href="https://docs.tigera.io/calico/latest/getting-started/kubernetes/flannel/install-for-flannel" target="_blank" rel="noopener"><strong>canal</strong></a> — Calico for policy enforcement, Flannel for the data plane (VXLAN). It is the <code>canal-fvthj</code> Pod you spotted in <a href="/tutorial/que-es-un-pod/como-kubelet-crea-un-pod">Part 4</a>. In pure Calico with BGP, cross-node traffic would take a direct route to the peer instead of going through a tunnel.</p>

          <p>To inspect the Pod's network without going through <code>kubectl exec</code> (useful when the container has no <code>ip</code> binary), enter the netns from the host:</p>

          <pre><code># Get the pause PID.
# NOTE: 'inspectp' (with p) for sandboxes; 'inspect' is for containers
# and will return NotFound if you pass it a pod ID.
PAUSE_PID=$(crictl inspectp $(crictl pods --name nginx -q) | jq '.info.pid')
echo \${PAUSE_PID}
# 67623   ← actual PID of the /pause process on the host

# Run host commands inside the Pod's netns
sudo nsenter -t \${PAUSE_PID} --net ip addr
# 1: lo: &lt;LOOPBACK,UP&gt; mtu 65536 ...
# 3: eth0@if9: &lt;BROADCAST,MULTICAST,UP,LOWER_UP&gt; mtu 1450
#     link/ether 9e:8d:bc:bf:c9:81 brd ff:ff:ff:ff:ff:ff link-netnsid 0
#     inet 192.168.1.4/32 scope global eth0

sudo nsenter -t \${PAUSE_PID} --net ss -tlnp
# State   Local Address:Port    Process
# LISTEN  0.0.0.0:80            users:(("nginx",pid=67656,fd=6),("nginx",pid=67623,fd=6))
# LISTEN  [::]:80               users:(("nginx",pid=67656,fd=7),("nginx",pid=67623,fd=7))</code></pre>

          <p>What you see in the <code>ss</code> output are the app's <em>nginx</em> processes — pause never listens on any port (it just owns the namespace, it does not serve traffic). If you repeat the exercise with a busybox Pod that just sleeps, <code>ss -tlnp</code> comes back empty: the namespace exists but nothing is listening.</p>

          <h2>How containerd calls CNI</h2>

          <p>containerd uses the <a href="https://github.com/containerd/go-cni" target="_blank" rel="noopener noreferrer">go-cni</a> library, which loads configuration from <code>/etc/cni/net.d/</code> and executes binaries from <code>/opt/cni/bin/</code>. In <a href="https://github.com/containerd/containerd/blob/main/internal/cri/server/sandbox_run.go" target="_blank" rel="noopener noreferrer">sandbox_run.go</a> the call happens in <code>setupPodNetwork()</code> right after the sandbox is created:</p>

          <pre><code># Relevant files on the node
ls /etc/cni/net.d/
# 10-canal.conflist          ← active CNI config: Canal (Calico + Flannel)
# 87-podman-bridge.conflist  ← podman's own bridge, unused by k8s
# calico-kubeconfig          ← kubeconfig the Calico pods use
#                              to talk to the API server

ls -lh /opt/cni/bin/
# total 257M
# -rwsr-xr-x  56M  Apr 24 20:18  calico              ← setuid: needs CAP_*
# -rwsr-xr-x  56M  Apr 24 20:18  calico-ipam         ← setuid: manages IPs
# -rwsr-xr-x  56M  Apr 24 20:18  install             ← setuid: install helper
# -rwxr-xr-x 5.5M  Aug 28  2025  bridge              ← reference plugin
# -rwxr-xr-x 3.1M  Apr 24 20:18  host-local          ← reference IPAM
# -rwxr-xr-x 3.2M  Apr 24 20:18  loopback
# -rwxr-xr-x 2.4M  Apr 24 20:18  flannel             ← Calico ships flannel
# -rwxr-xr-x 3.7M  Apr 24 20:18  bandwidth           ← traffic shaping
# -rwxr-xr-x 3.6M  Aug 28  2025  portmap             ← hostPort → iptables
# ... 17 more binaries (dhcp, dummy, firewall, host-device, ipvlan, macvlan,
#                      ptp, sbr, static, tap, tuning, vlan, vrf, ...)</code></pre>

          <p>Three operational details worth reading:</p>

          <ul>
            <li><strong>The setuid bit (<code>-rwsr-xr-x</code>) on <code>calico</code>, <code>calico-ipam</code> and <code>install</code></strong>: these binaries need elevated capabilities (<code>CAP_NET_ADMIN</code>, <code>CAP_SYS_ADMIN</code>) to create interfaces, modify routing tables and enter netns. The runtime invokes them as root, but the setuid bit shields them against invocations that lost privileges along the way.</li>
            <li><strong>56 MB per <code>calico*</code> binary</strong>: these are statically-linked Go binaries with every dependency vendored (libcalico, gobgp, etcd client, etc.). Compare to the <a href="#the-reference-plugins">reference plugins</a> from <code>containernetworking/plugins</code> at 3-5 MB because they do much less.</li>
            <li><strong><code>flannel</code> is present even when we run Calico</strong>: the <a href="https://docs.tigera.io/calico/latest/getting-started/kubernetes/helm" target="_blank" rel="noopener">official Calico chart</a> (hosted at <a href="https://github.com/projectcalico/calico/tree/master/charts/tigera-operator" target="_blank" rel="noopener"><code>charts/tigera-operator</code></a>) ships <em>all</em> standard CNI binaries to support the <a href="https://docs.tigera.io/calico/latest/getting-started/kubernetes/flannel/install-for-flannel" target="_blank" rel="noopener">Calico-on-Flannel (canal) mode</a> and hybrid setups. Which one gets invoked is decided by the active conflist (<code>10-canal.conflist</code> on this cluster).</li>
          </ul>

          <h2>The reference plugins</h2>

          <p>The <a href="https://github.com/containernetworking/plugins#plugins-supplied" target="_blank" rel="noopener">containernetworking/plugins</a> repository keeps the reference implementations, grouped into four categories: <strong>Main</strong> (interface creation — <code>bridge</code>, <code>ipvlan</code>, <code>macvlan</code>, <code>ptp</code>, <code>vlan</code>, <code>host-device</code>, <code>dummy</code>, <code>loopback</code>), <strong>Windows</strong> (<code>win-bridge</code>, <code>win-overlay</code>), <strong>IPAM</strong> (IP allocation — <code>host-local</code>, <code>dhcp</code>, <code>static</code>) and <strong>Meta</strong> (<code>tuning</code>, <code>portmap</code>, <code>bandwidth</code>, <code>sbr</code>, <code>firewall</code>).</p>

          <p>We show a minimal sample — the four that appear in any basic Kubernetes setup. The <a href="https://github.com/containernetworking/plugins#plugins-supplied" target="_blank" rel="noopener">full list with descriptions</a> lives in the repo's README:</p>

          <table>
            <thead>
              <tr><th>Plugin</th><th>Type</th><th>What it does</th></tr>
            </thead>
            <tbody>
              <tr><td><code>bridge</code></td><td>Main</td><td>Connects the Pod to a Linux bridge on the host</td></tr>
              <tr><td><code>loopback</code></td><td>Main</td><td>Configures the <code>lo</code> interface inside the Pod</td></tr>
              <tr><td><code>host-local</code></td><td>IPAM</td><td>Assigns IPs from a range tracked in a local file</td></tr>
              <tr><td><code>dhcp</code></td><td>IPAM</td><td>Obtains an IP via DHCP</td></tr>
            </tbody>
          </table>

          <p>Calico, Flannel, and Cilium are more complex plugins that build on these same principles — they follow the same environment variable and stdin/stdout protocol, but with additional logic for cross-node routing, network policies, and observability.</p>
        `,
};
