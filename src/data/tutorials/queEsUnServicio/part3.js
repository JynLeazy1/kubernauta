export default {
  es: `
          <p>kube-proxy corre como un DaemonSet en cada nodo del cluster. No es un proxy en el sentido tradicional — no hay un proceso intermedio que abre conexiones y las reenvía. Su trabajo es más sutil: observa los cambios en la API y traduce ese estado deseado en reglas del kernel que interceptan el tráfico.</p>

          <pre><code>kubectl get pods -n kube-system -l k8s-app=kube-proxy -o wide
# NAME               READY   STATUS    NODE
# kube-proxy-5knhs   1/1     Running   node01
# kube-proxy-fdcft   1/1     Running   controlplane</code></pre>

          <p>Cuando creas un Service, kube-proxy lo detecta inmediatamente vía un watch contra el API server — el mismo mecanismo de Informers que usa kubelet. En cuanto recibe el evento, sincroniza las reglas del nodo para reflejar el nuevo estado. Los propios logs de kube-proxy muestran ese proceso al arrancar:</p>

          <pre><code>kubectl logs -n kube-system -l k8s-app=kube-proxy
# "Starting endpoint slice config controller"
# "Waiting for caches to sync" controller="endpoint slice config"
# "Starting serviceCIDR config controller"
# "Caches are synced" controller="service config"
# "Caches are synced" controller="endpoint slice config"</code></pre>

          <p>Cada vez que un Pod aparece, desaparece o cambia de IP, kube-proxy actualiza las reglas para que apunten a los endpoints activos. El modo en que traduce ese estado al kernel tiene tres variantes.</p>

          <h2>Modo iptables (default)</h2>

          <p>En el modo iptables, kube-proxy crea chains y reglas en la tabla <code>nat</code> de netfilter. Cada Service genera una chain <code>KUBE-SVC-*</code> con reglas de probabilidad estadística para distribuir el tráfico entre los Pods disponibles. Cada Pod (endpoint) tiene su propia chain <code>KUBE-SEP-*</code> con la regla DNAT que reescribe la IP destino.</p>

          <p>El procesamiento de los paquetes ocurre completamente en el kernel — kube-proxy solo administra las reglas desde espacio de usuario. El problema de escala es que iptables evalúa las reglas secuencialmente: con miles de Services, un paquete puede tener que recorrer miles de reglas antes de encontrar la que le aplica.</p>

          <p>El modo activo se configura en el ConfigMap de kube-proxy. La config tiene secciones independientes para los tres modos — solo una se activa según el valor de <code>mode</code>:</p>

          <pre><code>kubectl get configmap kube-proxy -n kube-system -o yaml
# ...
#     mode: ""          ← string vacío = iptables por defecto
#     iptables:
#       masqueradeAll: false
#       minSyncPeriod: 0s
#       syncPeriod: 0s
#     ipvs:
#       scheduler: ""
#       strictARP: false
#       syncPeriod: 0s
#     nftables:
#       masqueradeAll: false
#       minSyncPeriod: 0s</code></pre>

          <h2>Modo IPVS (deprecado desde 1.35)</h2>

          <p>IPVS (IP Virtual Server) es un módulo del kernel diseñado específicamente para load balancing de alta performance. En lugar de chains iptables, crea una tabla hash de virtual servers. La búsqueda es O(1) independientemente de cuántos Services existan.</p>

          <p>kube-proxy en modo IPVS crea un virtual server por cada ClusterIP:port y un real server por cada Pod backend. El kernel hace el DNAT directamente desde la tabla hash sin recorrer reglas linealmente. Puedes ver los virtual servers con <code>ipvsadm</code>:</p>

          <pre><code># En modo iptables, ipvsadm no muestra nada aunque el binario esté disponible
sudo ipvsadm -Ln
# IP Virtual Server version 1.2.1 (size=4096)
# Prot LocalAddress:Port Scheduler Flags
#   -> RemoteAddress:Port    Forward Weight ActiveConn InActConn
# (vacío — kube-proxy está en modo iptables, no IPVS)

# En modo IPVS se vería así:
# TCP  10.108.153.200:80 rr
#   -> 10.244.1.5:80    Masq    1      0          0</code></pre>

          <p>IPVS fue <strong>deprecado en Kubernetes 1.35</strong> y puede ser removido en una versión futura. Si tienes clusters usando IPVS, la migración recomendada es a nftables. La documentación oficial y el <a href="https://github.com/kubernetes/enhancements/issues/5495" target="_blank">KEP de deprecación</a> tienen los detalles.</p>

          <h2>Modo nftables (GA desde 1.33, modo recomendado)</h2>

          <p>nftables es el sucesor de iptables en el kernel Linux. Usa un bytecode compilado en lugar de reglas evaluadas secuencialmente, lo que mejora el rendimiento y simplifica la administración. Fue introducido como alpha en Kubernetes 1.29 y <strong>alcanzó GA en 1.33</strong>. Sigue el mismo modelo conceptual que el modo iptables — chains y reglas de NAT — pero con el backend más moderno del kernel.</p>

          <p>nftables es el <strong>modo recomendado</strong> para instalaciones nuevas en kernels modernos (Linux 5.13 o superior). Sin embargo, por compatibilidad hacia atrás, <strong>iptables sigue siendo el default</strong> cuando el campo <code>mode</code> está vacío — el cambio de default no ocurrirá hasta una versión futura.</p>

          <h2>Cómo kube-proxy elige el modo</h2>

          <p>El modo activo se configura en el campo <code>mode</code> del ConfigMap de kube-proxy. Los valores válidos son <code>"iptables"</code>, <code>"ipvs"</code> y <code>"nftables"</code>. Si el campo está vacío — que es el valor por defecto en la mayoría de los clusters — kube-proxy no falla ni usa un fallback implícito: hay una función específica que lo maneja. En <a href="https://github.com/kubernetes/kubernetes/blob/master/cmd/kube-proxy/app/server_linux.go" target="_blank"><code>cmd/kube-proxy/app/server_linux.go</code></a>, <code>platformApplyDefaults()</code> hace exactamente esa comparación antes de que kube-proxy arranque:</p>

          <pre><code>// cmd/kube-proxy/app/server_linux.go
func (o *Options) platformApplyDefaults(config *proxyconfigapi.KubeProxyConfiguration) {
    if config.Mode == "" {
        o.logger.Info("Using iptables proxy")
        config.Mode = proxyconfigapi.ProxyModeIPTables
    }
    // ...</code></pre>

          <p><code>ProxyModeIPTables</code> es una constante de tipo string definida en <a href="https://github.com/kubernetes/kubernetes/blob/master/pkg/proxy/apis/config/types.go" target="_blank"><code>pkg/proxy/apis/config/types.go</code></a>: su valor es simplemente <code>"iptables"</code>. No hay magia — es una comparación directa con el string vacío.</p>

          <p>En la mayoría de los clusters en producción hoy, el modo activo es iptables. En las siguientes secciones vamos a diseccionarlo en detalle: qué chains crea exactamente, cómo funciona el load balancing estadístico, y cómo trazarlo en un cluster real.</p>
        `,
  en: `
          <p>kube-proxy runs as a DaemonSet on every node in the cluster. It is not a proxy in the traditional sense — there is no intermediate process opening connections and forwarding them. Its job is more subtle: it watches for changes in the API and translates that desired state into kernel rules that intercept traffic.</p>

          <pre><code>kubectl get pods -n kube-system -l k8s-app=kube-proxy -o wide
# NAME               READY   STATUS    NODE
# kube-proxy-5knhs   1/1     Running   node01
# kube-proxy-fdcft   1/1     Running   controlplane</code></pre>

          <p>When you create a Service, kube-proxy detects it immediately via a watch against the API server — the same Informer mechanism used by kubelet. As soon as it receives the event, it syncs the node's rules to reflect the new state. kube-proxy's own logs show this process at startup:</p>

          <pre><code>kubectl logs -n kube-system -l k8s-app=kube-proxy
# "Starting endpoint slice config controller"
# "Waiting for caches to sync" controller="endpoint slice config"
# "Starting serviceCIDR config controller"
# "Caches are synced" controller="service config"
# "Caches are synced" controller="endpoint slice config"</code></pre>

          <p>Every time a Pod appears, disappears, or changes its IP, kube-proxy updates the rules to point to the active endpoints. The mode in which it translates that state to the kernel has three variants.</p>

          <h2>iptables mode (default)</h2>

          <p>In iptables mode, kube-proxy creates chains and rules in the <code>nat</code> table of netfilter. Each Service generates a <code>KUBE-SVC-*</code> chain with statistical probability rules to distribute traffic among the available Pods. Each Pod (endpoint) has its own <code>KUBE-SEP-*</code> chain with the DNAT rule that rewrites the destination IP.</p>

          <p>Packet processing happens entirely in the kernel — kube-proxy only manages the rules from user space. The scaling problem is that iptables evaluates rules sequentially: with thousands of Services, a packet may need to traverse thousands of rules before finding the one that applies.</p>

          <p>The active mode is configured in the kube-proxy ConfigMap. An empty string means iptables:</p>

          <pre><code>kubectl get configmap kube-proxy -n kube-system -o yaml | grep mode
#     mode: ""   ← empty string = iptables by default</code></pre>

          <h2>IPVS mode (deprecated since 1.35)</h2>

          <p>IPVS (IP Virtual Server) is a kernel module designed specifically for high-performance load balancing. Instead of iptables chains, it creates a hash table of virtual servers. Lookup is O(1) regardless of how many Services exist.</p>

          <p>kube-proxy in IPVS mode creates one virtual server per ClusterIP:port and one real server per Pod backend. The kernel does the DNAT directly from the hash table without traversing rules linearly. You can see the virtual servers with <code>ipvsadm</code>:</p>

          <pre><code># In iptables mode, ipvsadm shows nothing even if the binary is available
sudo ipvsadm -Ln
# IP Virtual Server version 1.2.1 (size=4096)
# Prot LocalAddress:Port Scheduler Flags
#   -> RemoteAddress:Port    Forward Weight ActiveConn InActConn
# (empty — kube-proxy is in iptables mode, not IPVS)

# In IPVS mode it would look like:
# TCP  10.108.153.200:80 rr
#   -> 10.244.1.5:80    Masq    1      0          0</code></pre>

          <p>IPVS was <strong>deprecated in Kubernetes 1.35</strong> and may be removed in a future release. Clusters using IPVS should migrate to nftables. The official documentation and the <a href="https://github.com/kubernetes/enhancements/issues/5495" target="_blank">deprecation KEP</a> have the details.</p>

          <h2>nftables mode (GA since 1.33, recommended mode)</h2>

          <p>nftables is the successor to iptables in the Linux kernel. It uses compiled bytecode instead of sequentially evaluated rules, which improves performance and simplifies management. It was introduced as alpha in Kubernetes 1.29 and <strong>reached GA in 1.33</strong>. It follows the same conceptual model as iptables mode — chains and NAT rules — but with the kernel's more modern backend.</p>

          <p>nftables is the <strong>recommended mode</strong> for new installations on modern kernels (Linux 5.13 or later). However, for backward compatibility, <strong>iptables remains the default</strong> when the <code>mode</code> field is empty — the default change will not happen until a future version.</p>

          <h2>How kube-proxy selects the mode</h2>

          <p>The active mode is configured in the <code>mode</code> field of the kube-proxy ConfigMap. Valid values are <code>"iptables"</code>, <code>"ipvs"</code>, and <code>"nftables"</code>. If the field is empty — which is the default in most clusters — kube-proxy does not fail or use an implicit fallback: there is a specific function that handles it. In <a href="https://github.com/kubernetes/kubernetes/blob/master/cmd/kube-proxy/app/server_linux.go" target="_blank"><code>cmd/kube-proxy/app/server_linux.go</code></a>, <code>platformApplyDefaults()</code> makes exactly that comparison before kube-proxy starts:</p>

          <pre><code>// cmd/kube-proxy/app/server_linux.go
func (o *Options) platformApplyDefaults(config *proxyconfigapi.KubeProxyConfiguration) {
    if config.Mode == "" {
        o.logger.Info("Using iptables proxy")
        config.Mode = proxyconfigapi.ProxyModeIPTables
    }
    // ...</code></pre>

          <p><code>ProxyModeIPTables</code> is a string constant defined in <a href="https://github.com/kubernetes/kubernetes/blob/master/pkg/proxy/apis/config/types.go" target="_blank"><code>pkg/proxy/apis/config/types.go</code></a>: its value is simply <code>"iptables"</code>. No magic — just a direct comparison against the empty string.</p>

          <p>In most production clusters today, the active mode is iptables. In the following sections we will dissect it in detail: exactly which chains it creates, how statistical load balancing works, and how to trace it in a real cluster.</p>
        `,
};
