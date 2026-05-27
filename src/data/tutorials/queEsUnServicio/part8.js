export default {
  es: `
          <p>Hasta aquí vimos cada pieza por separado: la ClusterIP virtual, kube-proxy y las reglas iptables, los EndpointSlices, los tipos de Service, CoreDNS y los search domains. Ahora vamos a trazar el camino completo de un paquete desde el primer carácter que escribe la aplicación hasta la respuesta que recibe — sin saltear nada.</p>

          <p>El escenario: un Pod en <code>192.168.1.5</code> llama a <code>curl http://nginx</code>. El Service <code>nginx</code> tiene ClusterIP <code>10.99.20.216</code> y tres Pods backend en <code>192.168.1.5</code>, <code>192.168.1.6</code> y <code>192.168.1.7</code>.</p>

          <h2>Paso 1: resolución DNS</h2>

          <p><code>curl</code> llama a <code>getaddrinfo("nginx")</code>. El resolver de libc lee <code>/etc/resolv.conf</code>: <code>nameserver 10.96.0.10</code>, search domains <code>default.svc.cluster.local svc.cluster.local cluster.local</code>, <code>ndots:5</code>. El nombre <code>nginx</code> tiene 0 puntos — menos de 5 — así que el resolver prueba el primer search domain antes de intentarlo como nombre absoluto. Envía una query A para <code>nginx.default.svc.cluster.local</code> a <code>10.96.0.10:53</code>.</p>

          <p>Ese paquete UDP con destino <code>10.96.0.10:53</code> es interceptado por las reglas iptables de kube-proxy — <code>10.96.0.10</code> es la ClusterIP del Service <code>kube-dns</code> — y redirigido via DNAT a uno de los Pods de CoreDNS. CoreDNS recibe la query, consulta su cache en memoria para el dominio <code>cluster.local</code> (recuerda: no cachea, responde directo desde su índice de Services), y devuelve un registro A: <code>nginx.default.svc.cluster.local → 10.99.20.216</code>. El resolver de libc recibe la respuesta y se la pasa a <code>curl</code>. <code>curl</code> ahora sabe que tiene que conectarse a <code>10.99.20.216:80</code>.</p>

          <h2>Paso 2: la conexión TCP y el primer paquete</h2>

          <p><code>curl</code> llama a <code>connect()</code>. El kernel crea un socket TCP y emite el primer paquete SYN con destino <code>10.99.20.216:80</code>. Ese paquete sale del network namespace del Pod a través de su interfaz virtual (<code>eth0</code>), cruza el veth pair hacia el nodo, y entra al stack de red del kernel del nodo — donde viven las reglas iptables.</p>

          <h2>Paso 3: netfilter intercepta el paquete</h2>

          <p>El paquete entra al hook <code>OUTPUT</code> de netfilter (o <code>PREROUTING</code> si viene de otro nodo). Netfilter lo deriva a la tabla <code>nat</code>, chain <code>KUBE-SERVICES</code>. Las reglas se evalúan en orden hasta que la que coincide con <code>10.99.20.216:80</code> gana y salta a <code>KUBE-SVC-2CMXP7HKUVJN7L6M</code>.</p>

          <p>En <code>KUBE-SVC-*</code>, la primera regla verifica si el origen está fuera del pod CIDR — si es así, marca el paquete para masquerading. Luego las reglas estadísticas deciden a qué Pod enviarlo: probabilidad 1/3 para el primero, 1/2 del resto para el segundo, todo lo que queda para el tercero. Supongamos que el paquete cae en la regla del tercer Pod y salta a <code>KUBE-SEP-4AGQXI4GR55VNW45</code>.</p>

          <p>En <code>KUBE-SEP-*</code>, la regla DNAT reescribe la IP de destino del paquete: de <code>10.99.20.216</code> a <code>192.168.1.7</code>. El paquete ahora tiene destino real. Conntrack registra la traducción: <em>conexión de 192.168.1.5:XXXXX→10.99.20.216:80 fue DNATteada a 192.168.1.7:80</em>.</p>

          <h2>Paso 4: enrutamiento al Pod</h2>

          <p>Con la IP de destino reescrita a <code>192.168.1.7</code>, el kernel consulta su tabla de ruteo. La ruta a <code>192.168.1.7</code> fue instalada por el plugin CNI (Canal/Calico en este cluster) cuando el Pod fue creado. El paquete viaja por la interfaz virtual del nodo hacia el network namespace del Pod destino, donde nginx está escuchando en el puerto 80.</p>

          <h2>Paso 5: el Pod responde</h2>

          <p>nginx procesa el request y emite la respuesta TCP con origen <code>192.168.1.7:80</code> y destino <code>192.168.1.5:XXXXX</code>. El paquete sale del Pod, entra al stack del nodo, y llega al hook de netfilter. Esta vez, conntrack lo intercepta antes de que llegue a las chains de la tabla nat: el módulo de connection tracking reconoce que este paquete es la respuesta a una conexión que fue DNATteada, y automáticamente reescribe la IP de origen de <code>192.168.1.7</code> a <code>10.99.20.216</code>.</p>

          <p>El paquete llega al Pod original con origen <code>10.99.20.216:80</code> — exactamente la IP a la que <code>curl</code> se conectó. La conexión TCP se completa correctamente. El Pod en <code>192.168.1.5</code> nunca supo que habló con <code>192.168.1.7</code>.</p>

          <h2>El flujo completo</h2>

          <pre><code># 1. DNS: nginx → nginx.default.svc.cluster.local → 10.99.20.216
#    (getaddrinfo → search domain → query A → CoreDNS → A record)

# 2. TCP SYN: src=192.168.1.5 dst=10.99.20.216:80
#    (curl connect() → kernel socket → paquete sale del Pod)

# 3. iptables nat OUTPUT:
#    KUBE-SERVICES → KUBE-SVC-2CMXP7HKUVJN7L6M
#    → statistic probability 0.333... → KUBE-SEP-4AGQXI4GR55VNW45
#    → DNAT tcp to:192.168.1.7:80
#    conntrack registra: 192.168.1.5:X→10.99.20.216:80 ↔ 192.168.1.7:80

# 4. Routing: kernel → ruta CNI → veth → network ns Pod 192.168.1.7
#    nginx recibe SYN, acepta conexión

# 5. Respuesta: src=192.168.1.7:80 dst=192.168.1.5:X
#    conntrack: reescribe src 192.168.1.7 → 10.99.20.216
#    curl recibe respuesta de 10.99.20.216:80 ✓</code></pre>

          <p>Cada componente hace exactamente una cosa: CoreDNS resuelve nombres, kube-proxy instala reglas, netfilter reescribe IPs, conntrack recuerda traducciones, el CNI enruta al Pod. Ninguno sabe del trabajo de los demás — se coordinan a través del estado del kernel, no a través de comunicación directa.</p>
        `,
  en: `
          <p>So far we have seen each piece separately: the virtual ClusterIP, kube-proxy and iptables rules, EndpointSlices, Service types, CoreDNS and search domains. Now we will trace the complete path of a packet from the first character the application writes to the response it receives — skipping nothing.</p>

          <p>The scenario: a Pod at <code>192.168.1.5</code> calls <code>curl http://nginx</code>. The <code>nginx</code> Service has ClusterIP <code>10.99.20.216</code> and three backend Pods at <code>192.168.1.5</code>, <code>192.168.1.6</code>, and <code>192.168.1.7</code>.</p>

          <h2>Step 1: DNS resolution</h2>

          <p><code>curl</code> calls <code>getaddrinfo("nginx")</code>. The libc resolver reads <code>/etc/resolv.conf</code>: <code>nameserver 10.96.0.10</code>, search domains <code>default.svc.cluster.local svc.cluster.local cluster.local</code>, <code>ndots:5</code>. The name <code>nginx</code> has 0 dots — fewer than 5 — so the resolver tries the first search domain before attempting it as an absolute name. It sends an A query for <code>nginx.default.svc.cluster.local</code> to <code>10.96.0.10:53</code>.</p>

          <p>That UDP packet destined for <code>10.96.0.10:53</code> is intercepted by kube-proxy's iptables rules — <code>10.96.0.10</code> is the ClusterIP of the <code>kube-dns</code> Service — and redirected via DNAT to one of the CoreDNS Pods. CoreDNS receives the query, consults its in-memory index for the <code>cluster.local</code> domain (remember: no caching, it answers directly from its Service index), and returns an A record: <code>nginx.default.svc.cluster.local → 10.99.20.216</code>. The libc resolver receives the response and passes it to <code>curl</code>. <code>curl</code> now knows it needs to connect to <code>10.99.20.216:80</code>.</p>

          <h2>Step 2: the TCP connection and the first packet</h2>

          <p><code>curl</code> calls <code>connect()</code>. The kernel creates a TCP socket and emits the first SYN packet with destination <code>10.99.20.216:80</code>. That packet leaves the Pod's network namespace through its virtual interface (<code>eth0</code>), crosses the veth pair to the node, and enters the kernel's network stack on the node — where the iptables rules live.</p>

          <h2>Step 3: netfilter intercepts the packet</h2>

          <p>The packet enters the <code>OUTPUT</code> hook of netfilter (or <code>PREROUTING</code> if it comes from another node). Netfilter routes it to the <code>nat</code> table, chain <code>KUBE-SERVICES</code>. Rules are evaluated in order until the one matching <code>10.99.20.216:80</code> wins and jumps to <code>KUBE-SVC-2CMXP7HKUVJN7L6M</code>.</p>

          <p>In <code>KUBE-SVC-*</code>, the first rule checks whether the source is outside the pod CIDR — if so, it marks the packet for masquerading. Then the statistical rules decide which Pod to send it to: probability 1/3 for the first, 1/2 of the remainder for the second, everything left for the third. Say the packet lands on the third Pod's rule and jumps to <code>KUBE-SEP-4AGQXI4GR55VNW45</code>.</p>

          <p>In <code>KUBE-SEP-*</code>, the DNAT rule rewrites the destination IP of the packet: from <code>10.99.20.216</code> to <code>192.168.1.7</code>. The packet now has a real destination. Conntrack records the translation: <em>connection from 192.168.1.5:XXXXX→10.99.20.216:80 was DNATed to 192.168.1.7:80</em>.</p>

          <h2>Step 4: routing to the Pod</h2>

          <p>With the destination IP rewritten to <code>192.168.1.7</code>, the kernel looks up its routing table. The route to <code>192.168.1.7</code> was installed by the CNI plugin (Canal/Calico in this cluster) when the Pod was created. The packet travels through the node's virtual interface to the destination Pod's network namespace, where nginx is listening on port 80.</p>

          <h2>Step 5: the Pod responds</h2>

          <p>nginx processes the request and emits the TCP response with source <code>192.168.1.7:80</code> and destination <code>192.168.1.5:XXXXX</code>. The packet leaves the Pod, enters the node's network stack, and reaches the netfilter hook. This time, conntrack intercepts it before it reaches the nat table chains: the connection tracking module recognizes that this packet is the response to a connection that was DNATed, and automatically rewrites the source IP from <code>192.168.1.7</code> to <code>10.99.20.216</code>.</p>

          <p>The packet arrives at the original Pod with source <code>10.99.20.216:80</code> — exactly the IP <code>curl</code> connected to. The TCP connection completes correctly. The Pod at <code>192.168.1.5</code> never knew it was talking to <code>192.168.1.7</code>.</p>

          <h2>The complete flow</h2>

          <pre><code># 1. DNS: nginx → nginx.default.svc.cluster.local → 10.99.20.216
#    (getaddrinfo → search domain → A query → CoreDNS → A record)

# 2. TCP SYN: src=192.168.1.5 dst=10.99.20.216:80
#    (curl connect() → kernel socket → packet leaves Pod)

# 3. iptables nat OUTPUT:
#    KUBE-SERVICES → KUBE-SVC-2CMXP7HKUVJN7L6M
#    → statistic probability 0.333... → KUBE-SEP-4AGQXI4GR55VNW45
#    → DNAT tcp to:192.168.1.7:80
#    conntrack records: 192.168.1.5:X→10.99.20.216:80 ↔ 192.168.1.7:80

# 4. Routing: kernel → CNI route → veth → network ns Pod 192.168.1.7
#    nginx receives SYN, accepts connection

# 5. Response: src=192.168.1.7:80 dst=192.168.1.5:X
#    conntrack: rewrites src 192.168.1.7 → 10.99.20.216
#    curl receives response from 10.99.20.216:80 ✓</code></pre>

          <p>Each component does exactly one thing: CoreDNS resolves names, kube-proxy installs rules, netfilter rewrites IPs, conntrack remembers translations, the CNI routes to the Pod. None of them knows about the others' work — they coordinate through kernel state, not through direct communication.</p>
        `,
};
