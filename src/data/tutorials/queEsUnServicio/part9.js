export default {
  es: `
          <p>Hasta aquí vimos cómo funciona el mecanismo. Ahora vamos a demostrarlo de la forma más directa posible: eliminar el Service de Kubernetes, crear las reglas iptables a mano, y verificar que el tráfico llega a los Pods sin que Kubernetes toque nada.</p>

          <h2>Punto de partida</h2>

          <p>Tenemos los tres Pods de nginx corriendo en <code>192.168.1.4</code>, <code>192.168.1.5</code> y <code>192.168.1.6</code>. Eliminamos el Service para que kube-proxy limpie sus reglas:</p>

          <pre><code>kubectl delete svc nginx
# service "nginx" deleted

iptables -t nat -L KUBE-SERVICES -n | grep 10.111
# (vacío — kube-proxy eliminó todas las reglas del Service)</code></pre>

          <p><code>-t nat</code> selecciona la tabla nat, que es donde viven todas las reglas de kube-proxy. <code>-L KUBE-SERVICES</code> lista solo esa chain — el punto de entrada desde donde kube-proxy despacha el tráfico hacia cada Service. <code>-n</code> imprime IPs sin resolver nombres DNS. Grep filtra por la ClusterIP que tenía el Service. El output vacío confirma que kube-proxy ya limpió sus reglas.</p>

          <p>Las chains <code>KUBE-SVC-*</code> y <code>KUBE-SEP-*</code> del Service ya no existen. Los Pods siguen corriendo, pero no hay ningún mecanismo que distribuya tráfico a ellos. Vamos a construirlo nosotros.</p>

          <h2>Elegir una IP virtual</h2>

          <p>Usamos <code>10.99.99.99</code> como nuestra ClusterIP manual. Antes de crear cualquier regla, verificamos que esa IP realmente no existe en el nodo:</p>

          <pre><code>ip addr | grep 10.99.99.99
# (sin output)

ping -c 1 10.99.99.99
# PING 10.99.99.99 (10.99.99.99) 56(84) bytes of data.
# 1 packets transmitted, 0 received, 100% packet loss</code></pre>

          <p><code>ip addr</code> lista todas las interfaces de red del nodo con sus direcciones asignadas. El grep sin output confirma que <code>10.99.99.99</code> no está en ninguna interfaz. El ping envía un paquete ICMP — sin ninguna interfaz ni regla que lo intercepte, el kernel no sabe cómo entregarlo y lo descarta. Eso es exactamente lo que queremos confirmar antes de empezar: la IP no existe, y la vamos a hacer funcionar solo con iptables.</p>

          <h2>Crear las chains</h2>

          <pre><code>iptables -t nat -N DEMO-SVC
iptables -t nat -N DEMO-SEP-1
iptables -t nat -N DEMO-SEP-2
iptables -t nat -N DEMO-SEP-3</code></pre>

          <p><code>-N</code> crea una chain nueva (New) con el nombre dado. Las chains son contenedores vacíos de reglas — crearlas no tiene ningún efecto sobre el tráfico todavía. <code>DEMO-SVC</code> va a hacer el rol de <code>KUBE-SVC-*</code>: recibir el tráfico hacia la IP virtual y distribuirlo. <code>DEMO-SEP-1/2/3</code> van a hacer el rol de <code>KUBE-SEP-*</code>: cada una apunta a un Pod específico con una regla DNAT.</p>

          <h2>Enganchar la IP virtual en netfilter</h2>

          <pre><code>iptables -t nat -A OUTPUT    -p tcp -d 10.99.99.99 --dport 80 -j DEMO-SVC
iptables -t nat -A PREROUTING -p tcp -d 10.99.99.99 --dport 80 -j DEMO-SVC</code></pre>

          <p><code>-A</code> agrega (Append) una regla al final de la chain indicada. <code>OUTPUT</code> intercepta paquetes generados localmente en el nodo — por ejemplo, un <code>curl</code> que ejecutas desde el controlplane. <code>PREROUTING</code> intercepta paquetes que llegan por la red antes de que el kernel tome la decisión de routing — cubre el caso de tráfico que viene de otro nodo o Pod. Necesitamos los dos hooks para que la IP virtual funcione desde cualquier origen. <code>-p tcp</code> restringe la regla a TCP. <code>-d 10.99.99.99</code> filtra por IP destino. <code>--dport 80</code> filtra por puerto destino. <code>-j DEMO-SVC</code> hace el jump a nuestra chain cuando los tres filtros coinciden.</p>

          <h2>Load balancing estadístico</h2>

          <pre><code>iptables -t nat -A DEMO-SVC -m statistic --mode random --probability 0.33333333349 -j DEMO-SEP-1
iptables -t nat -A DEMO-SVC -m statistic --mode random --probability 0.50000000000 -j DEMO-SEP-2
iptables -t nat -A DEMO-SVC -j DEMO-SEP-3</code></pre>

          <p><code>-m statistic</code> carga el módulo de estadísticas de iptables. <code>--mode random --probability N</code> hace que la regla se aplique con probabilidad N sobre los paquetes que lleguen a ese punto de la chain. Las reglas se evalúan en orden: el primer paquete tiene 33% de chance de ir a SEP-1. Si no fue a SEP-1, el paquete llega a la segunda regla con probabilidad 50% de ir a SEP-2 — que sobre el total equivale al 33% restante. Si tampoco fue a SEP-2, cae en la tercera regla sin condición y va a SEP-3. El resultado matemático es distribución uniforme 1/3 para cada Pod.</p>

          <p>La tercera regla no tiene <code>-m statistic</code> porque ya no hay elección: todos los paquetes que llegaron hasta ahí van a SEP-3 sin condición.</p>

          <h2>DNAT a cada Pod</h2>

          <pre><code>iptables -t nat -A DEMO-SEP-1 -p tcp -j DNAT --to-destination 192.168.1.4:80
iptables -t nat -A DEMO-SEP-2 -p tcp -j DNAT --to-destination 192.168.1.5:80
iptables -t nat -A DEMO-SEP-3 -p tcp -j DNAT --to-destination 192.168.1.6:80</code></pre>

          <p><code>DNAT</code> (Destination NAT) es el target que reescribe la IP y puerto de destino del paquete. <code>--to-destination 192.168.1.4:80</code> reemplaza la IP destino original (<code>10.99.99.99:80</code>) por la IP real del Pod. Después de este punto, el paquete tiene destino <code>192.168.1.4:80</code> — el kernel puede enrutarlo normalmente porque esa IP sí existe en la red de Pods. conntrack registra la traducción para poder reescribir el origen en la respuesta.</p>

          <h2>Verificar las reglas</h2>

          <pre><code>iptables -t nat -L DEMO-SVC -n --line-numbers
# Chain DEMO-SVC (2 references)
# num  target      prot  opt  source      destination
# 1    DEMO-SEP-1  0     --   0.0.0.0/0   0.0.0.0/0   statistic mode random probability 0.33333333349
# 2    DEMO-SEP-2  0     --   0.0.0.0/0   0.0.0.0/0   statistic mode random probability 0.50000000000
# 3    DEMO-SEP-3  0     --   0.0.0.0/0   0.0.0.0/0

iptables -t nat -L DEMO-SEP-1 -n
# Chain DEMO-SEP-1 (1 references)
# target  prot  opt  source      destination
# DNAT    6     --   0.0.0.0/0   0.0.0.0/0   tcp to:192.168.1.4:80</code></pre>

          <p><code>--line-numbers</code> agrega el número de regla en la columna <code>num</code> — útil para saber el orden exacto en que se evalúan. El <code>(2 references)</code> en el encabezado indica que DEMO-SVC es referenciada desde dos reglas: la de OUTPUT y la de PREROUTING. El <code>6</code> en la columna <code>prot</code> de DEMO-SEP-1 es el número de protocolo TCP en el kernel — iptables lo muestra como número cuando se usa <code>-n</code>.</p>

          <h2>Probar</h2>

          <pre><code>curl -s http://10.99.99.99:80 | grep title
# &lt;title&gt;Welcome to nginx!&lt;/title&gt;</code></pre>

          <p><code>-s</code> silencia el progress bar de curl. El pipe a <code>grep title</code> filtra la respuesta HTML para mostrar solo la línea del título. Funciona. La IP <code>10.99.99.99</code> no existe en ninguna interfaz, ningún proceso escucha en ella, Kubernetes no sabe que existe — y aun así el tráfico llega a nginx. El kernel interceptó el paquete en OUTPUT, evaluó las reglas, aplicó el DNAT, y conntrack manejó el viaje de vuelta.</p>

          <p>Para confirmar que el load balancing distribuye a los tres Pods, hacemos varias requests y consultamos conntrack:</p>

          <pre><code>for i in $(seq 1 9); do curl -s http://10.99.99.99:80 > /dev/null; done
conntrack -L -p tcp --dport 80 2>/dev/null | grep 10.99.99.99
# tcp  6  TIME_WAIT src=172.30.1.2 dst=10.99.99.99 ... src=192.168.1.4 dst=192.168.0.0 ...
# tcp  6  TIME_WAIT src=172.30.1.2 dst=10.99.99.99 ... src=192.168.1.5 dst=192.168.0.0 ...
# tcp  6  TIME_WAIT src=172.30.1.2 dst=10.99.99.99 ... src=192.168.1.6 dst=192.168.0.0 ...</code></pre>

          <p>El for loop hace 9 requests al puerto 80 descartando el output (<code>> /dev/null</code>) — solo nos interesa generar entradas en conntrack. <code>conntrack -L</code> lista todas las conexiones que el kernel está rastreando. <code>-p tcp --dport 80</code> filtra solo conexiones TCP al puerto 80. <code>2>/dev/null</code> descarta la línea de resumen que conntrack imprime en stderr. Cada línea del output muestra dos pares IP: el primero es la conexión vista desde el cliente (<code>src=172.30.1.2 dst=10.99.99.99</code>), el segundo es cómo quedó después del DNAT (<code>src=192.168.1.4/5/6 dst=192.168.0.0</code>). Los tres Pods aparecen como origen en el lado derecho — el load balancing distribuyó las requests.</p>

          <h2>Limpiar</h2>

          <pre><code>iptables -t nat -D OUTPUT    -p tcp -d 10.99.99.99 --dport 80 -j DEMO-SVC
iptables -t nat -D PREROUTING -p tcp -d 10.99.99.99 --dport 80 -j DEMO-SVC
iptables -t nat -F DEMO-SVC
iptables -t nat -F DEMO-SEP-1
iptables -t nat -F DEMO-SEP-2
iptables -t nat -F DEMO-SEP-3
iptables -t nat -X DEMO-SVC
iptables -t nat -X DEMO-SEP-1
iptables -t nat -X DEMO-SEP-2
iptables -t nat -X DEMO-SEP-3</code></pre>

          <p><code>-D</code> elimina (Delete) una regla específica de una chain built-in — hay que especificar la regla exacta que se quiere borrar. <code>-F</code> vacía (Flush) todas las reglas de una chain — necesario antes de poder eliminarla. <code>-X</code> elimina (eXpunge) una chain definida por el usuario — solo funciona si la chain está vacía y no tiene referencias. El orden importa: primero se eliminan las referencias desde OUTPUT y PREROUTING con <code>-D</code>, luego se vacían las chains con <code>-F</code>, y por último se eliminan las chains vacías con <code>-X</code>.</p>

          <p>Lo que acabamos de hacer es exactamente lo que kube-proxy hace cada vez que se crea un Service — con la diferencia de que kube-proxy lo hace en milisegundos, para todos los nodos del cluster simultáneamente, y lo mantiene sincronizado con el estado de los Pods via EndpointSlices. La implementación de Kubernetes es más robusta, pero el mecanismo es idéntico al que acabamos de escribir a mano.</p>
        `,
  en: `
          <p>So far we have seen how the mechanism works. Now we will prove it in the most direct way possible: delete the Kubernetes Service, create the iptables rules by hand, and verify that traffic reaches the Pods without Kubernetes touching anything.</p>

          <h2>Starting point</h2>

          <p>We have three nginx Pods running at <code>192.168.1.4</code>, <code>192.168.1.5</code>, and <code>192.168.1.6</code>. We delete the Service so kube-proxy cleans up its rules:</p>

          <pre><code>kubectl delete svc nginx
# service "nginx" deleted

iptables -t nat -L KUBE-SERVICES -n | grep 10.111
# (empty — kube-proxy removed all the Service rules)</code></pre>

          <p><code>-t nat</code> selects the nat table, where all kube-proxy rules live. <code>-L KUBE-SERVICES</code> lists only that chain — the entry point from which kube-proxy dispatches traffic to each Service. <code>-n</code> prints IPs without resolving DNS names. The grep filters by the ClusterIP the Service had. The empty output confirms kube-proxy has already cleaned up its rules.</p>

          <p>The <code>KUBE-SVC-*</code> and <code>KUBE-SEP-*</code> chains for the Service no longer exist. The Pods are still running, but there is no mechanism to distribute traffic to them. We are going to build it ourselves.</p>

          <h2>Choose a virtual IP</h2>

          <p>We use <code>10.99.99.99</code> as our manual ClusterIP. Before creating any rule, we verify that this IP truly does not exist on the node:</p>

          <pre><code>ip addr | grep 10.99.99.99
# (no output)

ping -c 1 10.99.99.99
# PING 10.99.99.99 (10.99.99.99) 56(84) bytes of data.
# 1 packets transmitted, 0 received, 100% packet loss</code></pre>

          <p><code>ip addr</code> lists all network interfaces on the node with their assigned addresses. The grep with no output confirms <code>10.99.99.99</code> is not on any interface. The ping sends an ICMP packet — with no interface or rule to intercept it, the kernel does not know how to deliver it and drops it. That is exactly what we want to confirm before starting: the IP does not exist, and we are going to make it work with iptables alone.</p>

          <h2>Create the chains</h2>

          <pre><code>iptables -t nat -N DEMO-SVC
iptables -t nat -N DEMO-SEP-1
iptables -t nat -N DEMO-SEP-2
iptables -t nat -N DEMO-SEP-3</code></pre>

          <p><code>-N</code> creates a New chain with the given name. Chains are empty rule containers — creating them has no effect on traffic yet. <code>DEMO-SVC</code> will play the role of <code>KUBE-SVC-*</code>: receiving traffic destined for the virtual IP and distributing it. <code>DEMO-SEP-1/2/3</code> will play the role of <code>KUBE-SEP-*</code>: each one points to a specific Pod with a DNAT rule.</p>

          <h2>Hook the virtual IP into netfilter</h2>

          <pre><code>iptables -t nat -A OUTPUT    -p tcp -d 10.99.99.99 --dport 80 -j DEMO-SVC
iptables -t nat -A PREROUTING -p tcp -d 10.99.99.99 --dport 80 -j DEMO-SVC</code></pre>

          <p><code>-A</code> Appends a rule to the end of the named chain. <code>OUTPUT</code> intercepts packets generated locally on the node — for example, a <code>curl</code> you run from the controlplane. <code>PREROUTING</code> intercepts packets arriving from the network before the kernel makes the routing decision — it covers traffic coming from another node or Pod. We need both hooks for the virtual IP to work from any origin. <code>-p tcp</code> restricts the rule to TCP. <code>-d 10.99.99.99</code> filters by destination IP. <code>--dport 80</code> filters by destination port. <code>-j DEMO-SVC</code> jumps to our chain when all three filters match.</p>

          <h2>Statistical load balancing</h2>

          <pre><code>iptables -t nat -A DEMO-SVC -m statistic --mode random --probability 0.33333333349 -j DEMO-SEP-1
iptables -t nat -A DEMO-SVC -m statistic --mode random --probability 0.50000000000 -j DEMO-SEP-2
iptables -t nat -A DEMO-SVC -j DEMO-SEP-3</code></pre>

          <p><code>-m statistic</code> loads the iptables statistics module. <code>--mode random --probability N</code> makes the rule apply with probability N to packets reaching that point in the chain. Rules are evaluated in order: the first packet has a 33% chance of going to SEP-1. If it did not go to SEP-1, the packet reaches the second rule with 50% probability of going to SEP-2 — which over the total is the remaining 33%. If it also did not go to SEP-2, it falls through to the third rule unconditionally and goes to SEP-3. The mathematical result is uniform 1/3 distribution across all three Pods.</p>

          <p>The third rule has no <code>-m statistic</code> because there is no choice left: all packets that reached it go to SEP-3 unconditionally.</p>

          <h2>DNAT to each Pod</h2>

          <pre><code>iptables -t nat -A DEMO-SEP-1 -p tcp -j DNAT --to-destination 192.168.1.4:80
iptables -t nat -A DEMO-SEP-2 -p tcp -j DNAT --to-destination 192.168.1.5:80
iptables -t nat -A DEMO-SEP-3 -p tcp -j DNAT --to-destination 192.168.1.6:80</code></pre>

          <p><code>DNAT</code> (Destination NAT) is the target that rewrites the destination IP and port of the packet. <code>--to-destination 192.168.1.4:80</code> replaces the original destination (<code>10.99.99.99:80</code>) with the real Pod IP. After this point, the packet has destination <code>192.168.1.4:80</code> — the kernel can route it normally because that IP exists on the Pod network. conntrack records the translation so it can rewrite the source IP in the response.</p>

          <h2>Verify the rules</h2>

          <pre><code>iptables -t nat -L DEMO-SVC -n --line-numbers
# Chain DEMO-SVC (2 references)
# num  target      prot  opt  source      destination
# 1    DEMO-SEP-1  0     --   0.0.0.0/0   0.0.0.0/0   statistic mode random probability 0.33333333349
# 2    DEMO-SEP-2  0     --   0.0.0.0/0   0.0.0.0/0   statistic mode random probability 0.50000000000
# 3    DEMO-SEP-3  0     --   0.0.0.0/0   0.0.0.0/0

iptables -t nat -L DEMO-SEP-1 -n
# Chain DEMO-SEP-1 (1 references)
# target  prot  opt  source      destination
# DNAT    6     --   0.0.0.0/0   0.0.0.0/0   tcp to:192.168.1.4:80</code></pre>

          <p><code>--line-numbers</code> adds the rule number in the <code>num</code> column — useful to see the exact evaluation order. The <code>(2 references)</code> in the header means DEMO-SVC is referenced from two rules: the OUTPUT rule and the PREROUTING rule. The <code>6</code> in the <code>prot</code> column of DEMO-SEP-1 is the kernel's protocol number for TCP — iptables shows it as a number when <code>-n</code> is used.</p>

          <h2>Test</h2>

          <pre><code>curl -s http://10.99.99.99:80 | grep title
# &lt;title&gt;Welcome to nginx!&lt;/title&gt;</code></pre>

          <p><code>-s</code> silences curl's progress bar. The pipe to <code>grep title</code> filters the HTML response to show only the title line. It works. The IP <code>10.99.99.99</code> does not exist on any interface, no process is listening on it, Kubernetes does not know it exists — and yet traffic reaches nginx. The kernel intercepted the packet at OUTPUT, evaluated the rules, applied the DNAT, and conntrack handled the return journey.</p>

          <p>To confirm that load balancing distributes to all three Pods, make several requests and query conntrack:</p>

          <pre><code>for i in $(seq 1 9); do curl -s http://10.99.99.99:80 > /dev/null; done
conntrack -L -p tcp --dport 80 2>/dev/null | grep 10.99.99.99
# tcp  6  TIME_WAIT src=172.30.1.2 dst=10.99.99.99 ... src=192.168.1.4 dst=192.168.0.0 ...
# tcp  6  TIME_WAIT src=172.30.1.2 dst=10.99.99.99 ... src=192.168.1.5 dst=192.168.0.0 ...
# tcp  6  TIME_WAIT src=172.30.1.2 dst=10.99.99.99 ... src=192.168.1.6 dst=192.168.0.0 ...</code></pre>

          <p>The for loop makes 9 requests to port 80 discarding the output (<code>> /dev/null</code>) — we only care about generating conntrack entries. <code>conntrack -L</code> lists all connections the kernel is currently tracking. <code>-p tcp --dport 80</code> filters to only TCP connections on port 80. <code>2>/dev/null</code> discards the summary line conntrack prints to stderr. Each output line shows two IP pairs: the first is the connection as seen from the client (<code>src=172.30.1.2 dst=10.99.99.99</code>), the second is how it looked after the DNAT (<code>src=192.168.1.4/5/6 dst=192.168.0.0</code>). All three Pods appear as the source on the right side — the load balancing distributed the requests.</p>

          <h2>Clean up</h2>

          <pre><code>iptables -t nat -D OUTPUT    -p tcp -d 10.99.99.99 --dport 80 -j DEMO-SVC
iptables -t nat -D PREROUTING -p tcp -d 10.99.99.99 --dport 80 -j DEMO-SVC
iptables -t nat -F DEMO-SVC
iptables -t nat -F DEMO-SEP-1
iptables -t nat -F DEMO-SEP-2
iptables -t nat -F DEMO-SEP-3
iptables -t nat -X DEMO-SVC
iptables -t nat -X DEMO-SEP-1
iptables -t nat -X DEMO-SEP-2
iptables -t nat -X DEMO-SEP-3</code></pre>

          <p><code>-D</code> Deletes a specific rule from a built-in chain — you must specify the exact rule to remove. <code>-F</code> Flushes all rules from a chain — required before the chain can be deleted. <code>-X</code> eXpunges a user-defined chain — only works if the chain is empty and has no references. Order matters: first remove the references from OUTPUT and PREROUTING with <code>-D</code>, then empty the chains with <code>-F</code>, then delete the empty chains with <code>-X</code>.</p>

          <p>What we just did is exactly what kube-proxy does every time a Service is created — except kube-proxy does it in milliseconds, across all cluster nodes simultaneously, and keeps it synchronized with Pod state via EndpointSlices. The Kubernetes implementation is more robust, but the mechanism is identical to what we just wrote by hand.</p>
        `,
}
