export default {
  es: `
          <p>En la parte anterior vimos que todo empieza en la chain <code>KUBE-SERVICES</code> de la tabla <code>nat</code>. Ahora vamos a diseccionarla entera: qué reglas la componen, cómo el kernel las evalúa, y cómo el load balancing estadístico distribuye el tráfico entre varios Pods sin ningún proceso intermediario.</p>

          <p>Para este análisis creamos un Deployment de nginx con tres réplicas y lo exponemos:</p>

          <pre><code>kubectl create deployment nginx --image=nginx --replicas=3
kubectl expose deploy nginx --port 80

kubectl get svc nginx
# NAME    TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)   AGE
# nginx   ClusterIP   10.99.20.216   &lt;none&gt;        80/TCP    10s

kubectl get pods -o wide
# NAME                     READY   IP            NODE
# nginx-66686b6766-74zs8   1/1     192.168.1.4   node01
# nginx-66686b6766-cp47m   1/1     192.168.1.5   node01
# nginx-66686b6766-tk7qv   1/1     192.168.1.6   node01</code></pre>

          <h2>La chain KUBE-SERVICES</h2>

          <p>Es el punto de entrada. Cada Service del cluster tiene una regla aquí. Cuando un paquete TCP llega a las chains <code>PREROUTING</code> o <code>OUTPUT</code>, netfilter lo deriva a <code>KUBE-SERVICES</code>. La chain evalúa las reglas en orden y la primera que coincide con la IP:puerto de destino gana:</p>

          <pre><code>iptables -t nat -L KUBE-SERVICES -n --line-numbers
# Chain KUBE-SERVICES (2 references)
# num  target                       prot  opt  source       destination
# 1    KUBE-SVC-NPX46M4PTMTKRN6Y   6     --   0.0.0.0/0    10.96.0.1        /* default/kubernetes:https cluster IP */ tcp dpt:443
# 2    KUBE-SVC-TCOU7JCQXEZGVUNU   17    --   0.0.0.0/0    10.96.0.10       /* kube-system/kube-dns:dns cluster IP */ udp dpt:53
# 3    KUBE-SVC-ERIFXISQEP7F7OF4   6     --   0.0.0.0/0    10.96.0.10       /* kube-system/kube-dns:dns-tcp cluster IP */ tcp dpt:53
# 4    KUBE-SVC-JD5MR3NA4I4DYORP   6     --   0.0.0.0/0    10.96.0.10       /* kube-system/kube-dns:metrics cluster IP */ tcp dpt:9153
# 5    KUBE-SVC-2CMXP7HKUVJN7L6M   6     --   0.0.0.0/0    10.99.20.216     /* default/nginx cluster IP */ tcp dpt:80
# 6    KUBE-NODEPORTS               0     --   0.0.0.0/0    0.0.0.0/0        /* kubernetes service nodeports */ ADDRTYPE match dst-type LOCAL</code></pre>

          <p>El protocolo se muestra como número: 6 es TCP, 17 es UDP, 0 es todos los protocolos. Un paquete con destino <code>10.99.20.216:80</code> coincide con la regla 5 y salta a la chain <code>KUBE-SVC-2CMXP7HKUVJN7L6M</code>. La regla 6, <code>KUBE-NODEPORTS</code>, siempre es la última — se evalúa solo si ningún ClusterIP coincidió, y solo para tráfico con destino local al nodo.</p>

          <h2>La chain KUBE-SVC-*: load balancing estadístico</h2>

          <p>Cada Service tiene su propia chain <code>KUBE-SVC-*</code>. Con tres réplicas, la chain tiene cuatro reglas: una de masquerading para tráfico que viene de fuera del pod CIDR, y una por cada Pod backend:</p>

          <pre><code>iptables -t nat -L KUBE-SVC-2CMXP7HKUVJN7L6M -n --line-numbers
# Chain KUBE-SVC-2CMXP7HKUVJN7L6M (1 references)
# num  target                       prot  opt  source              destination
# 1    KUBE-MARK-MASQ               6     --   !192.168.0.0/16     10.99.20.216    /* default/nginx cluster IP */ tcp dpt:80
# 2    KUBE-SEP-LJUUEGC24UMYBEWU   0     --   0.0.0.0/0           0.0.0.0/0       /* default/nginx -> 192.168.1.4:80 */ statistic mode random probability 0.33333333349
# 3    KUBE-SEP-BD6TRYPAX6RNC2PD   0     --   0.0.0.0/0           0.0.0.0/0       /* default/nginx -> 192.168.1.5:80 */ statistic mode random probability 0.50000000000
# 4    KUBE-SEP-XBSUSKRGZRORR4T6   0     --   0.0.0.0/0           0.0.0.0/0       /* default/nginx -> 192.168.1.6:80 */</code></pre>

          <p>La regla 1 marca para masquerading los paquetes cuyo origen no está en el rango <code>192.168.0.0/16</code> — es decir, tráfico que viene de fuera del cluster, como un <code>curl</code> desde el nodo. Las reglas 2, 3 y 4 implementan el load balancing.</p>

          <p>Las probabilidades no son arbitrarias — están calculadas para que cada Pod reciba exactamente un tercio del tráfico. La lógica es secuencial: el primer Pod tiene probabilidad 1/3. Si ese paquete no se desvía ahí (probabilidad 2/3), el siguiente tiene probabilidad 1/2 del tráfico restante — que es 1/3 del total. El tercer Pod recibe todo lo que sobra, también 1/3. La distribución es uniforme, sin estado, sin contadores compartidos entre nodos.</p>

          <h2>La chain KUBE-SEP-*: el DNAT</h2>

          <p>Cada endpoint tiene su propia chain <code>KUBE-SEP-*</code>. Contiene dos reglas: una para marcar paquetes que vienen del propio Pod (para el masquerading de retorno), y la regla DNAT que reescribe la IP destino:</p>

          <pre><code>iptables -t nat -L KUBE-SEP-LJUUEGC24UMYBEWU -n
# Chain KUBE-SEP-LJUUEGC24UMYBEWU (1 references)
# target          prot  opt  source         destination
# KUBE-MARK-MASQ  0     --   192.168.1.4    0.0.0.0/0    /* default/nginx */
# DNAT            6     --   0.0.0.0/0      0.0.0.0/0    /* default/nginx */ tcp to:192.168.1.4:80

sudo iptables -t nat -L KUBE-SEP-BD6TRYPAX6RNC2PD -n
# KUBE-MARK-MASQ  0     --   192.168.1.5    0.0.0.0/0    /* default/nginx */
# DNAT            6     --   0.0.0.0/0      0.0.0.0/0    /* default/nginx */ tcp to:192.168.1.5:80

sudo iptables -t nat -L KUBE-SEP-XBSUSKRGZRORR4T6 -n
# KUBE-MARK-MASQ  0     --   192.168.1.6    0.0.0.0/0    /* default/nginx */
# DNAT            6     --   0.0.0.0/0      0.0.0.0/0    /* default/nginx */ tcp to:192.168.1.6:80</code></pre>

          <p>La regla DNAT reescribe la IP destino del paquete de <code>10.99.20.216</code> a la IP real del Pod. A partir de ese momento, el kernel puede enrutarlo — la IP del Pod sí tiene una ruta en la tabla del nodo, puesta ahí por el plugin CNI. El paquete sale hacia el Pod.</p>

          <h2>conntrack: el viaje de vuelta</h2>

          <p>El Pod responde con su IP real como origen. El cliente envió el paquete a <code>10.99.20.216</code> — si recibiera una respuesta de <code>192.168.1.6</code>, la conexión TCP fallaría. conntrack evita ese problema: cuando se aplica el DNAT, el kernel registra la traducción. Cuando llega la respuesta del Pod, conntrack la intercepta y reescribe automáticamente la IP de origen de vuelta a <code>10.99.20.216</code>.</p>

          <p>Puedes verlo en vivo: haz el <code>curl</code> y corres <code>conntrack</code> justo después para capturar la entrada antes de que expire:</p>

          <pre><code>curl http://10.99.20.216:80 &gt; /dev/null

sudo conntrack -L -p tcp --dport 80
# tcp  6  118  TIME_WAIT
#   src=172.30.1.2  dst=10.99.20.216  sport=35180  dport=80
#   src=192.168.1.6 dst=192.168.0.0   sport=80     dport=55419  [ASSURED]</code></pre>

          <p>La primera línea es la conexión vista desde el cliente: origen <code>172.30.1.2</code> (el nodo), destino <code>10.99.20.216:80</code> (la ClusterIP). La segunda línea es la respuesta del Pod tal como conntrack la registró: origen <code>192.168.1.6</code> (el Pod), destino <code>192.168.0.0</code> — la IP del nodo en la red de Pods, a la que fue masqueradeado el source original. Las dos líneas juntas son la misma conexión, vista desde los dos lados de la traducción.</p>

          <h2>El flujo completo en tres pasos</h2>

          <p>Resumiendo lo que ocurre a nivel de kernel cuando un cliente llama a <code>http://10.99.20.216:80</code>: el paquete TCP entra a <code>KUBE-SERVICES</code> y coincide con la regla del Service. Salta a <code>KUBE-SVC-*</code>, donde una regla estadística decide a cuál Pod enviarlo. Salta a <code>KUBE-SEP-*</code>, donde el DNAT reescribe la IP destino. conntrack registra la traducción. El paquete sale hacia el Pod con su IP real. La respuesta vuelve, conntrack la intercepta y reescribe el origen. El cliente cierra el ciclo.</p>

          <p>Ningún proceso de espacio de usuario estuvo involucrado en el camino del paquete. kube-proxy instaló las reglas, pero una vez instaladas, el kernel las aplica solo. Eso es lo que hace que el modelo escale.</p>
        `,
  en: `
          <p>In the previous part we saw that everything starts at the <code>KUBE-SERVICES</code> chain of the <code>nat</code> table. Now we will dissect it completely: what rules compose it, how the kernel evaluates them, and how statistical load balancing distributes traffic across multiple Pods without any intermediary process.</p>

          <p>For this analysis we create an nginx Deployment with three replicas and expose it:</p>

          <pre><code>kubectl create deployment nginx --image=nginx --replicas=3
kubectl expose deploy nginx --port 80

kubectl get svc nginx
# NAME    TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)   AGE
# nginx   ClusterIP   10.99.20.216   &lt;none&gt;        80/TCP    10s

kubectl get pods -o wide
# NAME                     READY   IP            NODE
# nginx-66686b6766-74zs8   1/1     192.168.1.4   node01
# nginx-66686b6766-cp47m   1/1     192.168.1.5   node01
# nginx-66686b6766-tk7qv   1/1     192.168.1.6   node01</code></pre>

          <h2>The KUBE-SERVICES chain</h2>

          <p>This is the entry point. Every Service in the cluster has one rule here. When a TCP packet reaches the <code>PREROUTING</code> or <code>OUTPUT</code> chains, netfilter routes it to <code>KUBE-SERVICES</code>. The chain evaluates rules in order and the first one that matches the destination IP:port wins:</p>

          <pre><code>iptables -t nat -L KUBE-SERVICES -n --line-numbers
# Chain KUBE-SERVICES (2 references)
# num  target                       prot  opt  source       destination
# 1    KUBE-SVC-NPX46M4PTMTKRN6Y   6     --   0.0.0.0/0    10.96.0.1        /* default/kubernetes:https cluster IP */ tcp dpt:443
# 2    KUBE-SVC-TCOU7JCQXEZGVUNU   17    --   0.0.0.0/0    10.96.0.10       /* kube-system/kube-dns:dns cluster IP */ udp dpt:53
# 3    KUBE-SVC-ERIFXISQEP7F7OF4   6     --   0.0.0.0/0    10.96.0.10       /* kube-system/kube-dns:dns-tcp cluster IP */ tcp dpt:53
# 4    KUBE-SVC-JD5MR3NA4I4DYORP   6     --   0.0.0.0/0    10.96.0.10       /* kube-system/kube-dns:metrics cluster IP */ tcp dpt:9153
# 5    KUBE-SVC-2CMXP7HKUVJN7L6M   6     --   0.0.0.0/0    10.99.20.216     /* default/nginx cluster IP */ tcp dpt:80
# 6    KUBE-NODEPORTS               0     --   0.0.0.0/0    0.0.0.0/0        /* kubernetes service nodeports */ ADDRTYPE match dst-type LOCAL</code></pre>

          <p>The protocol is shown as a number: 6 is TCP, 17 is UDP, 0 is all protocols. A packet destined for <code>10.99.20.216:80</code> matches rule 5 and jumps to the <code>KUBE-SVC-2CMXP7HKUVJN7L6M</code> chain. Rule 6, <code>KUBE-NODEPORTS</code>, is always last — it is evaluated only if no ClusterIP matched, and only for traffic destined locally to the node.</p>

          <h2>The KUBE-SVC-* chain: statistical load balancing</h2>

          <p>Each Service has its own <code>KUBE-SVC-*</code> chain. With three replicas, the chain has four rules: one masquerading rule for traffic coming from outside the pod CIDR, and one per Pod backend:</p>

          <pre><code>iptables -t nat -L KUBE-SVC-2CMXP7HKUVJN7L6M -n --line-numbers
# Chain KUBE-SVC-2CMXP7HKUVJN7L6M (1 references)
# num  target                       prot  opt  source              destination
# 1    KUBE-MARK-MASQ               6     --   !192.168.0.0/16     10.99.20.216    /* default/nginx cluster IP */ tcp dpt:80
# 2    KUBE-SEP-LJUUEGC24UMYBEWU   0     --   0.0.0.0/0           0.0.0.0/0       /* default/nginx -> 192.168.1.4:80 */ statistic mode random probability 0.33333333349
# 3    KUBE-SEP-BD6TRYPAX6RNC2PD   0     --   0.0.0.0/0           0.0.0.0/0       /* default/nginx -> 192.168.1.5:80 */ statistic mode random probability 0.50000000000
# 4    KUBE-SEP-XBSUSKRGZRORR4T6   0     --   0.0.0.0/0           0.0.0.0/0       /* default/nginx -> 192.168.1.6:80 */</code></pre>

          <p>Rule 1 marks for masquerading any packet whose source is not within <code>192.168.0.0/16</code> — traffic coming from outside the cluster, such as a <code>curl</code> from the node. Rules 2, 3, and 4 implement the load balancing.</p>

          <p>The probabilities are not arbitrary — they are calculated so that each Pod receives exactly one third of the traffic. The logic is sequential: the first Pod has a probability of 1/3. If that packet is not diverted there (probability 2/3), the next one has a probability of 1/2 of the remaining traffic — which is 1/3 of the total. The third Pod receives everything left, also 1/3. The distribution is uniform, stateless, with no shared counters between nodes.</p>

          <h2>The KUBE-SEP-* chain: the DNAT</h2>

          <p>Each endpoint has its own <code>KUBE-SEP-*</code> chain. It contains two rules: one to mark packets coming from the Pod itself (for return masquerading), and the DNAT rule that rewrites the destination IP:</p>

          <pre><code>iptables -t nat -L KUBE-SEP-LJUUEGC24UMYBEWU -n
# Chain KUBE-SEP-LJUUEGC24UMYBEWU (1 references)
# target          prot  opt  source         destination
# KUBE-MARK-MASQ  0     --   192.168.1.4    0.0.0.0/0    /* default/nginx */
# DNAT            6     --   0.0.0.0/0      0.0.0.0/0    /* default/nginx */ tcp to:192.168.1.4:80

sudo iptables -t nat -L KUBE-SEP-BD6TRYPAX6RNC2PD -n
# KUBE-MARK-MASQ  0     --   192.168.1.5    0.0.0.0/0    /* default/nginx */
# DNAT            6     --   0.0.0.0/0      0.0.0.0/0    /* default/nginx */ tcp to:192.168.1.5:80

sudo iptables -t nat -L KUBE-SEP-XBSUSKRGZRORR4T6 -n
# KUBE-MARK-MASQ  0     --   192.168.1.6    0.0.0.0/0    /* default/nginx */
# DNAT            6     --   0.0.0.0/0      0.0.0.0/0    /* default/nginx */ tcp to:192.168.1.6:80</code></pre>

          <p>The DNAT rule rewrites the destination IP of the packet from <code>10.99.20.216</code> to the real Pod IP. From that point on, the kernel can route it — the Pod IP does have a route in the node's routing table, placed there by the CNI plugin. The packet goes to the Pod.</p>

          <h2>conntrack: the return journey</h2>

          <p>The Pod responds with its real IP as the source. The client sent the packet to <code>10.99.20.216</code> — if it received a response from <code>192.168.1.6</code>, the TCP connection would fail. conntrack prevents that: when the DNAT is applied, the kernel records the translation. When the Pod's response arrives, conntrack intercepts it and automatically rewrites the source IP back to <code>10.99.20.216</code>.</p>

          <p>You can see it live: do the <code>curl</code> and run <code>conntrack</code> immediately after to capture the entry before it expires:</p>

          <pre><code>curl http://10.99.20.216:80 &gt; /dev/null

sudo conntrack -L -p tcp --dport 80
# tcp  6  118  TIME_WAIT
#   src=172.30.1.2  dst=10.99.20.216  sport=35180  dport=80
#   src=192.168.1.6 dst=192.168.0.0   sport=80     dport=55419  [ASSURED]</code></pre>

          <p>The first line is the connection as seen from the client: source <code>172.30.1.2</code> (the node), destination <code>10.99.20.216:80</code> (the ClusterIP). The second line is the Pod's response as conntrack recorded it: source <code>192.168.1.6</code> (the Pod), destination <code>192.168.0.0</code> — the node's IP on the Pod network, to which the original source was masqueraded. Both lines together represent the same connection, seen from both sides of the translation.</p>

          <h2>The complete flow in three steps</h2>

          <p>Summarizing what happens at the kernel level when a client calls <code>http://10.99.20.216:80</code>: the TCP packet enters <code>KUBE-SERVICES</code> and matches the Service rule. It jumps to <code>KUBE-SVC-*</code>, where a statistical rule decides which Pod to send it to. It jumps to <code>KUBE-SEP-*</code>, where the DNAT rewrites the destination IP. conntrack records the translation. The packet goes to the Pod with its real IP. The response comes back, conntrack intercepts it and rewrites the source. The client closes the loop.</p>

          <p>No user space process was involved in the packet's path. kube-proxy installed the rules, but once installed, the kernel applies them on its own. That is what makes the model scale.</p>
        `,
}
