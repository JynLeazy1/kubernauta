export default {
  es: `
          <p>En el tutorial anterior vimos que un Pod tiene una IP asignada por el plugin CNI al namespace de red del pause container. Esa IP es real — existe en el kernel, en el veth pair, en las rutas del nodo. Pero tiene un problema fundamental: es efímera.</p>

          <p>Cuando un Pod muere y se recrea — por un crash, por un rollout, por que el nodo se cayó — el nuevo Pod obtiene una IP distinta. El plugin CNI asigna lo que tenga disponible en el rango del nodo. No hay garantía de continuidad. Si otro Pod tenía hardcodeada esa IP, dejó de funcionar.</p>

          <p>La solución obvia sería un registro DNS que apunte al Pod y se actualice solo. Kubernetes tiene eso. Pero DNS tiene TTL, y durante el tiempo que tarda en propagarse, las conexiones fallan. Para servicios que escalan horizontalmente — diez réplicas del mismo Pod — el problema se amplifica: ¿a cuál de las diez IPs llamas? ¿quién hace el load balancing?</p>

          <p>Un Service resuelve todo eso con una sola abstracción: una IP virtual estable que no cambia aunque los Pods detrás de ella cambien constantemente.</p>

          <p>Pero a diferencia de la IP de un Pod, la IP de un Service — la ClusterIP — no está asignada a ninguna interfaz de red. No existe en <code>ip addr</code>. No puedes hacerle <code>ping</code>. No hay ningún proceso escuchando en esa IP. Sin embargo, si abres una conexión TCP a ella, funciona.</p>

          <p>Eso no es magia. Es el kernel interceptando el tráfico antes de que salga del host y redirigiéndolo a un Pod real. La herramienta que crea esa ilusión es kube-proxy, y el mecanismo concreto son reglas iptables o entradas IPVS en el kernel.</p>

          <p>En este tutorial vamos a desarmarlo todo. Vamos a ver exactamente qué reglas crea kube-proxy, cómo el kernel las aplica paquete a paquete, cómo los EndpointSlices mantienen actualizada la lista de Pods detrás de cada Service, y cómo fluye un paquete desde que un Pod llama a <code>http://mi-servicio</code> hasta que llega a su destino.</p>

          <p>Al final vamos a replicar lo que hace kube-proxy a mano — crear las reglas iptables nosotros mismos y demostrar que el Service funciona sin que Kubernetes toque nada.</p>

          <h2>Herramientas que usamos en este tutorial</h2>

          <p><code>iptables</code> es la herramienta central — la usamos para inspeccionar las chains que crea kube-proxy y para escribir las reglas manuales de la demo final. <code>conntrack</code> permite ver las entradas de connection tracking del kernel; en Ubuntu/Debian viene en el paquete <code>conntrack</code>, que no está instalado por defecto. <code>ip</code> (<code>ip addr</code>, <code>ip route</code>) para inspeccionar interfaces y rutas de red. <code>curl</code> para hacer requests HTTP y verificar que el tráfico llega. <code>nslookup</code> y <code>tcpdump</code> en la sección de CoreDNS para observar el comportamiento del resolver y el costo oculto del DNS. <code>ipvsadm</code> aparece en la sección de modos de kube-proxy para ilustrar el modo IPVS, aunque el cluster de ejemplo corre en modo iptables.</p>

          <p>Si estás siguiendo el tutorial en un nodo Ubuntu/Debian, el único paquete que probablemente necesites instalar antes de empezar es:</p>

          <pre><code>apt-get install -y conntrack dnsutils tcpdump</code></pre>
        `,
  en: `
          <p>In the previous tutorial we saw that a Pod has an IP assigned by the CNI plugin to the pause container's network namespace. That IP is real — it exists in the kernel, in the veth pair, in the node's routes. But it has a fundamental problem: it is ephemeral.</p>

          <p>When a Pod dies and is recreated — due to a crash, a rollout, or a node failure — the new Pod gets a different IP. The CNI plugin assigns whatever is available in the node's range. There is no continuity guarantee. If another Pod had that IP hardcoded, it stopped working.</p>

          <p>The obvious solution would be a DNS record that points to the Pod and updates automatically. Kubernetes has that. But DNS has TTL, and during propagation time, connections fail. For horizontally scaled services — ten replicas of the same Pod — the problem multiplies: which of the ten IPs do you call? Who does the load balancing?</p>

          <p>A Service solves all of this with a single abstraction: a stable virtual IP that does not change even as the Pods behind it change constantly.</p>

          <p>But unlike a Pod's IP, a Service's IP — the ClusterIP — is not assigned to any network interface. It does not appear in <code>ip addr</code>. You cannot <code>ping</code> it. No process is listening on that IP. Yet if you open a TCP connection to it, it works.</p>

          <p>That is not magic. It is the kernel intercepting traffic before it leaves the host and redirecting it to a real Pod. The tool that creates this illusion is kube-proxy, and the concrete mechanism is iptables rules or IPVS entries in the kernel.</p>

          <p>In this tutorial we will take it all apart. We will see exactly what rules kube-proxy creates, how the kernel applies them packet by packet, how EndpointSlices keep the list of Pods behind each Service up to date, and how a packet flows from the moment a Pod calls <code>http://my-service</code> until it reaches its destination.</p>

          <p>At the end we will replicate what kube-proxy does by hand — creating the iptables rules ourselves and proving the Service works without Kubernetes touching anything.</p>

          <h2>Tools used in this tutorial</h2>

          <p><code>iptables</code> is the central tool — we use it to inspect the chains kube-proxy creates and to write the manual rules in the final demo. <code>conntrack</code> lets us see the kernel's connection tracking entries; on Ubuntu/Debian it comes in the <code>conntrack</code> package, which is not installed by default. <code>ip</code> (<code>ip addr</code>, <code>ip route</code>) to inspect network interfaces and routes. <code>curl</code> to make HTTP requests and verify traffic arrives. <code>nslookup</code> and <code>tcpdump</code> in the CoreDNS section to observe resolver behavior and the hidden cost of DNS. <code>ipvsadm</code> appears in the kube-proxy modes section to illustrate IPVS mode, though the example cluster runs in iptables mode.</p>

          <p>If you are following along on an Ubuntu/Debian node, the only packages you likely need to install before starting are:</p>

          <pre><code>apt-get install -y conntrack dnsutils tcpdump</code></pre>
        `,
};
