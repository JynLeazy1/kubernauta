const post = {
  id: 8,
  slug: 'migrar-a-nftables-kube-proxy',
  title: {
    es: 'Cómo migrar a nftables en kube-proxy',
    en: 'How to Migrate kube-proxy to nftables Mode',
  },
  date: '2026-04-10',
  author: 'Kubernauta',
  excerpt: {
    es: 'nftables alcanzó GA en Kubernetes 1.33 y es el modo recomendado para instalaciones nuevas. Esta guía cubre la migración desde iptables paso a paso, con verificación en el cluster.',
    en: 'nftables reached GA in Kubernetes 1.33 and is the recommended mode for new installations. This guide covers migrating from iptables step by step, with cluster verification.',
  },
  tags: ['kube-proxy', 'nftables', 'networking', 'kubernetes'],
  content: {
    es: `
      <p>Desde Kubernetes 1.33, <strong>nftables es el modo recomendado</strong> para kube-proxy. No es el default todavía — iptables sigue siendo el default cuando el campo <code>mode</code> está vacío — pero es el camino hacia donde va el proyecto. IPVS fue deprecado en 1.35. Esta guía cubre la migración desde iptables a nftables en un cluster existente.</p>

      <h2>Prerrequisito: verificar la versión del kernel</h2>

      <p>nftables requiere Linux 5.13 o superior. Los kernels más viejos no tienen soporte completo para las características que usa kube-proxy en modo nftables. Antes de tocar cualquier configuración, verifica el kernel en cada nodo:</p>

      <pre><code>uname -r
# 6.8.0-107-generic</code></pre>

      <p>Cualquier kernel 5.13+ funciona. Ubuntu 22.04 LTS usa 5.15, Ubuntu 24.04 usa 6.8, Debian 12 usa 6.1 — todos están bien. Si algún nodo tiene un kernel más viejo, la actualización del kernel tiene que ir primero.</p>

      <p>También puedes verificar que el módulo nf_tables está cargado:</p>

      <pre><code>lsmod | grep nf_tables
# nf_tables             376832  565 nft_compat,nft_chain_nat
# nfnetlink              20480  12 nft_compat,nfnetlink_acct,nf_conntrack_netlink,nf_tables,ip_set
# libcrc32c              12288  5 nf_conntrack,nf_nat,btrfs,nf_tables,raid456</code></pre>

      <p>En kernels modernos el módulo se carga automáticamente cuando se necesita — no hay que hacer nada manual.</p>

      <h2>Estado actual: modo iptables</h2>

      <p>Antes de migrar, confirma cuál es el modo activo. El ConfigMap de kube-proxy muestra el campo <code>mode</code>:</p>

      <pre><code>kubectl get configmap kube-proxy -n kube-system -o yaml | grep -A2 "mode:"
#     mode: ""
#     iptables:
#       masqueradeAll: false</code></pre>

      <p>Un string vacío significa iptables por defecto — la función <code>platformApplyDefaults()</code> en <code>server_linux.go</code> lo convierte a <code>"iptables"</code> antes de arrancar.</p>

      <h2>Editar el ConfigMap</h2>

      <p>La migración completa es un solo cambio en el ConfigMap:</p>

      <pre><code>kubectl edit configmap kube-proxy -n kube-system</code></pre>

      <p>Busca el campo <code>mode</code> y cámbialo a <code>"nftables"</code>:</p>

      <pre><code># Antes:
#     mode: ""
# Después:
      mode: "nftables"</code></pre>

      <p>Guarda y sal del editor. El ConfigMap se actualiza en el API server, pero los Pods de kube-proxy siguen corriendo con la configuración anterior — no leen el ConfigMap en caliente. Necesitan un restart.</p>

      <h2>Rollout restart del DaemonSet</h2>

      <pre><code>kubectl rollout restart daemonset kube-proxy -n kube-system
# daemonset.apps/kube-proxy restarted

kubectl rollout status daemonset kube-proxy -n kube-system
# daemon set "kube-proxy" successfully rolled out</code></pre>

      <p>El rollout actualiza los Pods de a uno por vez. Mientras un Pod viejo se termina y el nuevo arranca, hay una ventana breve en ese nodo donde las reglas se están regenerando. Las conexiones establecidas no se cortan — conntrack recuerda las traducciones existentes — pero conexiones nuevas durante esa ventana pueden tardar un ciclo más en procesarse.</p>

      <h2>Verificar el modo activo</h2>

      <p>La señal definitiva es <code>sudo nft list ruleset</code>: si aparece <code>table ip kube-proxy</code>, las reglas están activas en el kernel.</p>

      <p>En un cluster con Calico como CNI, el output incluye advertencias sobre tablas gestionadas por iptables-nft — son de Calico, no de kube-proxy, y son esperables:</p>

      <pre><code>sudo nft list ruleset | grep -A5 "kube"
# Warning: table ip nat is managed by iptables-nft, do not touch!
# Warning: table ip filter is managed by iptables-nft, do not touch!
# ...
# table ip kube-proxy {
#         comment "rules for kube-proxy"
#         set cluster-ips {
#                 type ipv4_addr
#                 comment "Active ClusterIPs"
#                 elements = { 10.96.0.1, 10.96.0.10 }
#         }
#         map service-ips {
#                 type ipv4_addr . inet_proto . inet_service : verdict
#                 comment "ClusterIP dispatch"
#                 elements = { 10.96.0.10 . tcp . 53 : goto service-NWBZK7IH-kube-system/kube-dns/tcp/dns-tcp,
#                              10.96.0.10 . udp . 53 : goto service-FY5PMXPG-kube-system/kube-dns/udp/dns,
#                              10.96.0.1  . tcp . 443 : goto service-2QRHZV4L-default/kubernetes/tcp/https }
#         }
#         chain service-FY5PMXPG-kube-system/kube-dns/udp/dns {
#                 ip daddr 10.96.0.10 ip saddr != 192.168.0.0/16 jump mark-for-masquerade
#                 numgen random mod 2 vmap { 0 : goto endpoint-O6ON3DXL-kube-system/kube-dns/udp/dns__192.168.1.2/53,
#                                           1 : goto endpoint-IHIQWJ7L-kube-system/kube-dns/udp/dns__192.168.1.3/53 }
#         }
#         chain endpoint-O6ON3DXL-kube-system/kube-dns/udp/dns__192.168.1.2/53 {
#                 ip saddr 192.168.1.2 jump mark-for-masquerade
#                 meta l4proto udp dnat to 192.168.1.2:53
#         }
# }</code></pre>

      <p>El modelo es diferente al de iptables. En lugar de chains con nombres como <code>KUBE-SVC-HASH</code>, hay un <code>map service-ips</code> que despacha con una sola operación de lookup en una tabla hash. Cada Service tiene una chain <code>service-HASH-namespace/name/proto/port</code>, y cada Pod backend tiene una chain <code>endpoint-HASH-namespace/name/proto/port__podIP/podPort</code>. El load balancing usa <code>numgen random mod N</code> — un número aleatorio módulo N — para distribuir el tráfico entre backends.</p>

      <p>También puedes confirmar que las chains de iptables ya no existen:</p>

      <pre><code>sudo iptables -t nat -L KUBE-SERVICES -n 2>/dev/null | wc -l
# 0
# (la chain KUBE-SERVICES ya no existe — kube-proxy dejó de escribir en iptables por completo)</code></pre>

      <h2>Verificar que los Services siguen funcionando</h2>

      <p>El cambio de modo es transparente para las aplicaciones. Crear un Deployment, exponer su puerto como Service, y hacer curl al ClusterIP confirma que el stack completo funciona:</p>

      <pre><code>kubectl create deployment nginx --image=nginx
kubectl expose deployment nginx --port 80

kubectl get svc nginx
# NAME    TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE
# nginx   ClusterIP   10.106.195.187   &lt;none&gt;        80/TCP    27s

curl http://10.106.195.187:80
# &lt;!DOCTYPE html&gt;
# &lt;html&gt;
# &lt;head&gt;&lt;title&gt;Welcome to nginx!&lt;/title&gt;...
# ...</code></pre>

      <p>Si la respuesta llega, el stack completo — EndpointSlices, kube-proxy en modo nftables, CNI — está funcionando correctamente.</p>

      <h2>Revertir si algo falla</h2>

      <p>Si algo no funciona como se esperaba, revertir es el mismo proceso en sentido inverso. Editar el ConfigMap y volver al modo anterior:</p>

      <pre><code>kubectl edit configmap kube-proxy -n kube-system
# Cambiar: mode: "nftables"
# Por:     mode: ""

kubectl rollout restart daemonset kube-proxy -n kube-system
kubectl rollout status daemonset kube-proxy -n kube-system</code></pre>

      <p>kube-proxy vuelve a modo iptables, regenera las reglas, y las entradas nftables desaparecen. Las aplicaciones no notan el cambio.</p>

      <h2>Una nota sobre el cambio de default</h2>

      <p>nftables es el modo recomendado pero todavía no es el default — cuando <code>mode</code> está vacío, kube-proxy elige iptables. Ese cambio de default está planificado para una versión futura. Por ahora, para usar nftables hay que configurarlo explícitamente como se describe en esta guía.</p>
    `,
    en: `
      <p>Since Kubernetes 1.33, <strong>nftables is the recommended mode</strong> for kube-proxy. It is not the default yet — iptables remains the default when the <code>mode</code> field is empty — but it is the direction the project is heading. IPVS was deprecated in 1.35. This guide covers migrating from iptables to nftables on an existing cluster.</p>

      <h2>Prerequisite: check the kernel version</h2>

      <p>nftables requires Linux 5.13 or later. Older kernels do not have full support for the features kube-proxy needs in nftables mode. Before touching any configuration, check the kernel on each node:</p>

      <pre><code>uname -r
# 6.8.0-107-generic</code></pre>

      <p>Any kernel 5.13+ works. Ubuntu 22.04 LTS ships 5.15, Ubuntu 24.04 ships 6.8, Debian 12 ships 6.1 — all are fine. If any node has an older kernel, the kernel upgrade needs to come first.</p>

      <p>You can also verify that the nf_tables module is loaded:</p>

      <pre><code>lsmod | grep nf_tables
# nf_tables             376832  565 nft_compat,nft_chain_nat
# nfnetlink              20480  12 nft_compat,nfnetlink_acct,nf_conntrack_netlink,nf_tables,ip_set
# libcrc32c              12288  5 nf_conntrack,nf_nat,btrfs,nf_tables,raid456</code></pre>

      <p>On modern kernels the module loads automatically when needed — no manual action required.</p>

      <h2>Current state: iptables mode</h2>

      <p>Before migrating, confirm the active mode. The kube-proxy ConfigMap shows the <code>mode</code> field:</p>

      <pre><code>kubectl get configmap kube-proxy -n kube-system -o yaml | grep -A2 "mode:"
#     mode: ""
#     iptables:
#       masqueradeAll: false</code></pre>

      <p>An empty string means iptables by default — the <code>platformApplyDefaults()</code> function in <code>server_linux.go</code> converts it to <code>"iptables"</code> before starting.</p>

      <h2>Edit the ConfigMap</h2>

      <p>The full migration is a single change in the ConfigMap:</p>

      <pre><code>kubectl edit configmap kube-proxy -n kube-system</code></pre>

      <p>Find the <code>mode</code> field and change it to <code>"nftables"</code>:</p>

      <pre><code># Before:
#     mode: ""
# After:
      mode: "nftables"</code></pre>

      <p>Save and exit. The ConfigMap is updated in the API server, but the kube-proxy Pods are still running with the old configuration — they do not reload the ConfigMap on the fly. They need a restart.</p>

      <h2>Rollout restart the DaemonSet</h2>

      <pre><code>kubectl rollout restart daemonset kube-proxy -n kube-system
# daemonset.apps/kube-proxy restarted

kubectl rollout status daemonset kube-proxy -n kube-system
# daemon set "kube-proxy" successfully rolled out</code></pre>

      <p>The rollout updates Pods one at a time. While an old Pod is terminating and the new one is starting, there is a brief window on that node where rules are being regenerated. Established connections are not dropped — conntrack remembers existing translations — but new connections during that window may take an extra cycle to be processed.</p>

      <h2>Verify the active mode</h2>

      <p>The definitive signal is <code>sudo nft list ruleset</code>: if <code>table ip kube-proxy</code> appears, the rules are active in the kernel.</p>

      <p>On a cluster using Calico as the CNI, the output includes warnings about tables managed by iptables-nft — those come from Calico, not kube-proxy, and are expected:</p>

      <pre><code>sudo nft list ruleset | grep -A5 "kube"
# Warning: table ip nat is managed by iptables-nft, do not touch!
# Warning: table ip filter is managed by iptables-nft, do not touch!
# ...
# table ip kube-proxy {
#         comment "rules for kube-proxy"
#         set cluster-ips {
#                 type ipv4_addr
#                 comment "Active ClusterIPs"
#                 elements = { 10.96.0.1, 10.96.0.10 }
#         }
#         map service-ips {
#                 type ipv4_addr . inet_proto . inet_service : verdict
#                 comment "ClusterIP dispatch"
#                 elements = { 10.96.0.10 . tcp . 53 : goto service-NWBZK7IH-kube-system/kube-dns/tcp/dns-tcp,
#                              10.96.0.10 . udp . 53 : goto service-FY5PMXPG-kube-system/kube-dns/udp/dns,
#                              10.96.0.1  . tcp . 443 : goto service-2QRHZV4L-default/kubernetes/tcp/https }
#         }
#         chain service-FY5PMXPG-kube-system/kube-dns/udp/dns {
#                 ip daddr 10.96.0.10 ip saddr != 192.168.0.0/16 jump mark-for-masquerade
#                 numgen random mod 2 vmap { 0 : goto endpoint-O6ON3DXL-kube-system/kube-dns/udp/dns__192.168.1.2/53,
#                                           1 : goto endpoint-IHIQWJ7L-kube-system/kube-dns/udp/dns__192.168.1.3/53 }
#         }
#         chain endpoint-O6ON3DXL-kube-system/kube-dns/udp/dns__192.168.1.2/53 {
#                 ip saddr 192.168.1.2 jump mark-for-masquerade
#                 meta l4proto udp dnat to 192.168.1.2:53
#         }
# }</code></pre>

      <p>The model differs from iptables. Instead of chains named <code>KUBE-SVC-HASH</code>, there is a <code>map service-ips</code> that dispatches with a single hash table lookup. Each Service has a <code>service-HASH-namespace/name/proto/port</code> chain, and each Pod backend has an <code>endpoint-HASH-namespace/name/proto/port__podIP/podPort</code> chain. Load balancing uses <code>numgen random mod N</code> — a random number modulo N — to distribute traffic across backends.</p>

      <p>You can also confirm that the iptables chains no longer exist:</p>

      <pre><code>sudo iptables -t nat -L KUBE-SERVICES -n 2>/dev/null | wc -l
# 0
# (the KUBE-SERVICES chain no longer exists — kube-proxy stopped writing to iptables entirely)</code></pre>

      <h2>Verify that Services still work</h2>

      <p>The mode change is transparent to applications. Create a Deployment, expose its port as a Service, and curl the ClusterIP:</p>

      <pre><code>kubectl create deployment nginx --image=nginx
kubectl expose deployment nginx --port 80

kubectl get svc nginx
# NAME    TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE
# nginx   ClusterIP   10.106.195.187   &lt;none&gt;        80/TCP    27s

curl http://10.106.195.187:80
# &lt;!DOCTYPE html&gt;
# &lt;html&gt;
# &lt;head&gt;&lt;title&gt;Welcome to nginx!&lt;/title&gt;...
# ...</code></pre>

      <p>If the response comes back, the full stack — EndpointSlices, kube-proxy in nftables mode, CNI — is working correctly.</p>

      <h2>Reverting if something goes wrong</h2>

      <p>If something does not work as expected, reverting is the same process in reverse. Edit the ConfigMap and go back to the previous mode:</p>

      <pre><code>kubectl edit configmap kube-proxy -n kube-system
# Change: mode: "nftables"
# To:     mode: ""

kubectl rollout restart daemonset kube-proxy -n kube-system
kubectl rollout status daemonset kube-proxy -n kube-system</code></pre>

      <p>kube-proxy switches back to iptables mode, regenerates the rules, and the nftables entries disappear. Applications do not notice the change.</p>

      <h2>A note on the default change</h2>

      <p>nftables is the recommended mode but is not yet the default — when <code>mode</code> is empty, kube-proxy picks iptables. That default change is planned for a future version. For now, using nftables requires explicit configuration as described in this guide.</p>
    `,
  },
}

export default post
