export default {
  es: `
          <p>Llegamos al final del recorrido. No del tema — Kubernetes tiene capas que van más lejos de lo que cubrimos — pero sí de lo que necesitás entender para que un Service no sea magia. Repasemos qué aprendimos y qué significa cada pieza.</p>

          <h2>El modelo mental correcto</h2>

          <p>Un Service no es un proceso. No hay ningún servidor escuchando en la ClusterIP. La ClusterIP ni siquiera existe como dirección en ninguna interfaz de red — si haces <code>ip addr</code> en cualquier nodo, no la vas a encontrar. Lo que existe son reglas en el kernel que interceptan paquetes con ese destino y los redirigen a Pods reales.</p>

          <p>Eso cambia cómo pensás en los problemas. Cuando una conexión falla, no estás buscando un proceso caído — estás buscando qué parte del pipeline de reglas no está funcionando: ¿kube-proxy corrió y escribió las reglas? ¿Los EndpointSlices tienen endpoints? ¿CoreDNS resolvió el nombre correcto? ¿conntrack tiene una entrada stale que está enviando tráfico a una IP que ya no existe?</p>

          <h2>Las piezas y lo que hace cada una</h2>

          <p>kube-proxy observa el API server via Informers y traduce cada Service y EndpointSlice en reglas del kernel. No toca paquetes. Su trabajo termina cuando escribe la última regla — a partir de ahí, es el kernel quien hace el trabajo.</p>

          <p>netfilter (iptables o nftables) intercepta los paquetes en los hooks <code>OUTPUT</code> y <code>PREROUTING</code> de la tabla nat. La chain <code>KUBE-SERVICES</code> es el punto de entrada: desde ahí, cada Service tiene su propia <code>KUBE-SVC-*</code> con reglas de probabilidad estadística, y cada Pod tiene su <code>KUBE-SEP-*</code> con la regla DNAT que reescribe la IP destino.</p>

          <p>conntrack es el módulo que hace que el viaje de vuelta funcione. Cuando el kernel aplica un DNAT a un paquete saliente, conntrack registra la traducción. Cuando la respuesta llega con la IP real del Pod como origen, conntrack la reconoce y reescribe automáticamente la IP de origen de vuelta a la ClusterIP. El cliente nunca sabe que habló con un Pod específico.</p>

          <p>Los EndpointSlices son la fuente de verdad sobre qué Pods están disponibles. No son solo una lista de IPs — tienen tres condiciones por endpoint (<code>ready</code>, <code>serving</code>, <code>terminating</code>), soportan topology hints para routing zonal, y se actualizan cada vez que un Pod aparece, desaparece o cambia de estado. kube-proxy los consume para saber qué reglas escribir.</p>

          <p>CoreDNS resuelve nombres a ClusterIPs. Para el dominio <code>cluster.local</code>, no cachea — responde directo desde su índice en memoria. La configuración <code>ndots:5</code> en <code>/etc/resolv.conf</code> hace que nombres sin cinco puntos pasen por los search domains primero, lo que agrega latencia si no se tiene en cuenta al escribir código que hace muchas resoluciones DNS.</p>

          <h2>El flujo completo en una línea</h2>

          <p><code>getaddrinfo("nginx")</code> → CoreDNS devuelve la ClusterIP → el kernel emite un SYN con destino ClusterIP → netfilter aplica DNAT a la IP del Pod → conntrack registra la traducción → el Pod responde con su IP real → conntrack reescribe el origen a la ClusterIP → el cliente recibe la respuesta.</p>

          <p>Eso es todo. No hay ningún componente extra en el medio. El paquete nunca pasa por un proxy de espacio de usuario — va directamente del cliente al Pod, con el kernel haciendo la reescritura de IPs en el camino.</p>

          <h2>Los tipos de Service y cuándo importa la diferencia</h2>

          <p>ClusterIP es el tipo base: una IP virtual accesible solo desde dentro del cluster. NodePort añade una regla en el puerto del nodo para tráfico externo, pero masquera todo el tráfico externo incondicionalmente (la chain <code>KUBE-EXT-*</code> vs <code>KUBE-SVC-*</code>). LoadBalancer depende del cloud provider para crear un balanceador externo que apunte a los NodePorts. ExternalName es solo un CNAME en CoreDNS. Headless elimina la ClusterIP y devuelve directamente los IPs de los Pods en DNS.</p>

          <p>La diferencia entre ClusterIP y NodePort en el tratamiento del masquerade importa cuando necesitás preservar la IP del cliente en el Pod — para eso existe <code>externalTrafficPolicy: Local</code>, que evita el masquerade pero restringe el tráfico a nodos que tienen un Pod local.</p>

          <h2>Dónde sigue el tema</h2>

          <p>Lo que cubrimos son los cimientos. Sobre esto se construyen cosas más complejas: Network Policies usan los mismos hooks de netfilter para filtrar tráfico entre Pods. Ingress y Gateway API añaden enrutamiento L7 arriba de los Services. Service Mesh (Istio, Linkerd) inyecta proxies sidecar que interceptan el tráfico antes de que llegue a las reglas de kube-proxy. Topology-aware routing ajusta los EndpointSlices dinámicamente para mantener el tráfico dentro de la misma zona.</p>

          <p>Todos esos temas empiezan donde terminamos: con el entendimiento de que una conexión entre Pods es un DNAT en el kernel, que conntrack mantiene el estado, y que el plano de control solo escribe reglas — no toca paquetes. Una vez que ese modelo está claro, el resto es acumulación de capas sobre la misma base.</p>
        `,
  en: `
          <p>We have reached the end of the journey. Not of the subject — Kubernetes has layers that go further than what we covered — but of what you need to understand so that a Service is no longer magic. Let us recap what we learned and what each piece means.</p>

          <h2>The correct mental model</h2>

          <p>A Service is not a process. There is no server listening on the ClusterIP. The ClusterIP does not even exist as an address on any network interface — if you run <code>ip addr</code> on any node, you will not find it. What exists are kernel rules that intercept packets with that destination and redirect them to real Pods.</p>

          <p>That changes how you think about problems. When a connection fails, you are not looking for a crashed process — you are looking for which part of the rules pipeline is broken: did kube-proxy run and write the rules? Do the EndpointSlices have endpoints? Did CoreDNS resolve the correct name? Does conntrack have a stale entry routing traffic to an IP that no longer exists?</p>

          <h2>The pieces and what each one does</h2>

          <p>kube-proxy watches the API server via Informers and translates each Service and EndpointSlice into kernel rules. It does not touch packets. Its job ends when it writes the last rule — from that point on, the kernel does the work.</p>

          <p>netfilter (iptables or nftables) intercepts packets at the <code>OUTPUT</code> and <code>PREROUTING</code> hooks in the nat table. The <code>KUBE-SERVICES</code> chain is the entry point: from there, each Service has its own <code>KUBE-SVC-*</code> with statistical probability rules, and each Pod has its <code>KUBE-SEP-*</code> with the DNAT rule that rewrites the destination IP.</p>

          <p>conntrack is the module that makes the return journey work. When the kernel applies a DNAT to an outgoing packet, conntrack records the translation. When the response arrives with the Pod's real IP as the source, conntrack recognizes it and automatically rewrites the source IP back to the ClusterIP. The client never knows it was talking to a specific Pod.</p>

          <p>EndpointSlices are the source of truth about which Pods are available. They are not just a list of IPs — they have three conditions per endpoint (<code>ready</code>, <code>serving</code>, <code>terminating</code>), support topology hints for zone-aware routing, and update every time a Pod appears, disappears, or changes state. kube-proxy consumes them to know what rules to write.</p>

          <p>CoreDNS resolves names to ClusterIPs. For the <code>cluster.local</code> domain, it does not cache — it answers directly from its in-memory index. The <code>ndots:5</code> setting in <code>/etc/resolv.conf</code> causes names with fewer than five dots to go through the search domains first, which adds latency if not accounted for when writing code that makes many DNS resolutions.</p>

          <h2>The complete flow in one line</h2>

          <p><code>getaddrinfo("nginx")</code> → CoreDNS returns the ClusterIP → the kernel emits a SYN to the ClusterIP → netfilter applies DNAT to the Pod's IP → conntrack records the translation → the Pod replies with its real IP → conntrack rewrites the source to the ClusterIP → the client receives the response.</p>

          <p>That is all. There is no extra component in between. The packet never passes through a user-space proxy — it goes directly from the client to the Pod, with the kernel rewriting IPs along the way.</p>

          <h2>Service types and when the difference matters</h2>

          <p>ClusterIP is the base type: a virtual IP accessible only from inside the cluster. NodePort adds a rule on the node's port for external traffic, but masquerades all external traffic unconditionally (the <code>KUBE-EXT-*</code> chain vs <code>KUBE-SVC-*</code>). LoadBalancer relies on the cloud provider to create an external load balancer pointing at the NodePorts. ExternalName is just a CNAME in CoreDNS. Headless removes the ClusterIP and returns the Pod IPs directly in DNS.</p>

          <p>The difference between ClusterIP and NodePort in masquerade handling matters when you need to preserve the client IP at the Pod — that is what <code>externalTrafficPolicy: Local</code> is for, which avoids masquerading but restricts traffic to nodes that have a local Pod.</p>

          <h2>Where the subject continues</h2>

          <p>What we covered is the foundation. More complex things build on top of it: Network Policies use the same netfilter hooks to filter traffic between Pods. Ingress and Gateway API add L7 routing on top of Services. Service Mesh (Istio, Linkerd) injects sidecar proxies that intercept traffic before it reaches kube-proxy's rules. Topology-aware routing adjusts EndpointSlices dynamically to keep traffic within the same zone.</p>

          <p>All of those topics start where we ended: with the understanding that a connection between Pods is a DNAT in the kernel, that conntrack maintains state, and that the control plane only writes rules — it never touches packets. Once that model is clear, everything else is layers stacked on the same foundation.</p>
        `,
}
