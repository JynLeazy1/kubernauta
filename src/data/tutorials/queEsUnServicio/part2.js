export default {
  es: `
          <p>Cuando creas un Service de tipo ClusterIP, Kubernetes le asigna una IP del rango configurado en el API server — por defecto <code>10.96.0.0/12</code>. Puedes verla con <code>kubectl get svc</code>:</p>

          <pre><code>kubectl run nginx --image=nginx
kubectl expose pod nginx --port 80

kubectl get svc
# NAME         TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE
# kubernetes   ClusterIP   10.96.0.1        &lt;none&gt;        443/TCP   9d
# nginx        ClusterIP   10.108.153.200   &lt;none&gt;        80/TCP    22m</code></pre>

          <p>Ahora buscala en las interfaces — del nodo controlplane y del nodo01:</p>

          <pre><code>ip addr | grep 10.108.153.200
# (sin output)

ip route | grep 10.108.153.200
# (sin output)

ssh node01
ip addr | grep 10.108.153.200
# (sin output)
ip route | grep 10.108.153.200
# (sin output)</code></pre>

          <p>No está en ningún nodo. No hay ninguna interfaz de red con esa IP, no hay ningún proceso escuchando en ella. Sin embargo:</p>

          <pre><code>curl http://10.108.153.200:80
# &lt;!DOCTYPE html&gt;
# &lt;html&gt;
# &lt;head&gt;
# &lt;title&gt;Welcome to nginx!&lt;/title&gt;
# ...   ← funciona

ping 10.108.153.200
# PING 10.108.153.200 56(84) bytes of data.
# 5 packets transmitted, 0 received, 100% packet loss   ← no responde</code></pre>

          <p><code>curl</code> funciona. <code>ping</code> no. Esa asimetría no es un bug — es la clave para entender exactamente qué es una ClusterIP.</p>

          <h2>Por qué curl funciona y ping no</h2>

          <p><code>ping</code> usa ICMP. <code>curl</code> usa TCP. La diferencia importa porque el mecanismo que hace funcionar la ClusterIP opera a nivel de conexiones TCP/UDP en el subsistema netfilter del kernel — específicamente en la tabla <code>nat</code>.</p>

          <p>Cuando un paquete TCP sale de un Pod con destino <code>10.108.153.200:80</code>, el kernel lo procesa a través de las chains de netfilter antes de enrutarlo. En las chains <code>PREROUTING</code> y <code>OUTPUT</code>, kube-proxy instaló reglas que interceptan ese paquete y reescriben la IP de destino — de <code>10.108.153.200</code> a la IP real de uno de los Pods detrás del Service. Eso es un DNAT (Destination NAT).</p>

          <p>Una vez reescrita la IP destino a la IP de un Pod real, el kernel ya sabe cómo enrutar el paquete — la IP del Pod sí existe, sí tiene una ruta. El paquete llega al Pod. La respuesta vuelve con la IP del Pod como origen. Pero conntrack — el módulo de seguimiento de conexiones del kernel — recuerda que esa conexión fue DNAT-eada, y automáticamente reescribe la IP de origen en la respuesta de vuelta a <code>10.108.153.200</code>. El cliente nunca ve la IP del Pod.</p>

          <p><code>ping</code> no funciona porque las reglas instaladas por kube-proxy solo aplican a TCP y UDP, no a ICMP. El paquete llega a <code>10.108.153.200</code>, no hay ninguna regla que lo intercepte, no hay ninguna interfaz que lo reciba, y se descarta silenciosamente.</p>

          <h2>Dónde viven las reglas</h2>

          <p>Las reglas están en la tabla <code>nat</code> de iptables. Puedes verlas directamente en el nodo:</p>

          <pre><code>iptables -t nat -L KUBE-SERVICES | grep 10.108.153.200
# KUBE-SVC-2CMXP7HKUVJN7L6M  tcp  --  anywhere  10.108.153.200  /* default/nginx cluster IP */ tcp dpt:http</code></pre>

          <p>Esa entrada le dice al kernel: todo paquete TCP con destino <code>10.108.153.200:80</code> envialo a la chain <code>KUBE-SVC-2CMXP7HKUVJN7L6M</code>. Esa chain es donde ocurre el load balancing y el DNAT al Pod real. Lo veremos en detalle en la parte 4.</p>

          <p>Por ahora, lo fundamental: una ClusterIP no es una IP asignada a una interfaz. Es un selector de reglas iptables. Existe solo en la tabla nat del kernel, en cada nodo del cluster. kube-proxy es el proceso que las crea y las mantiene actualizadas.</p>
        `,
  en: `
          <p>When you create a ClusterIP Service, Kubernetes assigns it an IP from the range configured in the API server — by default <code>10.96.0.0/12</code>. You can see it with <code>kubectl get svc</code>:</p>

          <pre><code>kubectl run nginx --image=nginx
kubectl expose pod nginx --port 80

kubectl get svc
# NAME         TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE
# kubernetes   ClusterIP   10.96.0.1        &lt;none&gt;        443/TCP   9d
# nginx        ClusterIP   10.108.153.200   &lt;none&gt;        80/TCP    22m</code></pre>

          <p>Now look for it on the network interfaces — on both the controlplane and node01:</p>

          <pre><code>ip addr | grep 10.108.153.200
# (no output)

ip route | grep 10.108.153.200
# (no output)

ssh node01
ip addr | grep 10.108.153.200
# (no output)
ip route | grep 10.108.153.200
# (no output)</code></pre>

          <p>It is not on any node. There is no network interface with that IP, no process listening on it. Yet:</p>

          <pre><code>curl http://10.108.153.200:80
# &lt;!DOCTYPE html&gt;
# &lt;html&gt;
# &lt;head&gt;
# &lt;title&gt;Welcome to nginx!&lt;/title&gt;
# ...   ← works

ping 10.108.153.200
# PING 10.108.153.200 56(84) bytes of data.
# 5 packets transmitted, 0 received, 100% packet loss   ← no response</code></pre>

          <p><code>curl</code> works. <code>ping</code> does not. That asymmetry is not a bug — it is the key to understanding exactly what a ClusterIP is.</p>

          <h2>Why curl works and ping does not</h2>

          <p><code>ping</code> uses ICMP. <code>curl</code> uses TCP. The difference matters because the mechanism that makes ClusterIP work operates at the TCP/UDP connection level in the kernel's netfilter subsystem — specifically in the <code>nat</code> table.</p>

          <p>When a TCP packet leaves a Pod destined for <code>10.108.153.200:80</code>, the kernel processes it through the netfilter chains before routing it. In the <code>PREROUTING</code> and <code>OUTPUT</code> chains, kube-proxy has installed rules that intercept that packet and rewrite the destination IP — from <code>10.108.153.200</code> to the real IP of one of the Pods behind the Service. That is DNAT (Destination NAT).</p>

          <p>Once the destination IP is rewritten to a real Pod IP, the kernel knows how to route the packet — the Pod IP does exist, it does have a route. The packet reaches the Pod. The response comes back with the Pod IP as the source. But conntrack — the kernel's connection tracking module — remembers that the connection was DNAT-ed, and automatically rewrites the source IP in the response back to <code>10.108.153.200</code>. The client never sees the Pod IP.</p>

          <p><code>ping</code> does not work because the rules kube-proxy installed only apply to TCP and UDP, not ICMP. The packet arrives at <code>10.108.153.200</code>, no rule intercepts it, no interface receives it, and it is silently dropped.</p>

          <h2>Where the rules live</h2>

          <p>The rules live in the <code>nat</code> table of iptables. You can see them directly on the node:</p>

          <pre><code>iptables -t nat -L KUBE-SERVICES | grep 10.108.153.200
# KUBE-SVC-2CMXP7HKUVJN7L6M  tcp  --  anywhere  10.108.153.200  /* default/nginx cluster IP */ tcp dpt:http</code></pre>

          <p>That entry tells the kernel: every TCP packet destined for <code>10.108.153.200:80</code>, send it to the chain <code>KUBE-SVC-2CMXP7HKUVJN7L6M</code>. That chain is where load balancing and DNAT to the real Pod happen. We will cover it in detail in part 4.</p>

          <p>For now, the fundamental point: a ClusterIP is not an IP assigned to an interface. It is a selector for iptables rules. It exists only in the nat table of the kernel, on every node in the cluster. kube-proxy is the process that creates and keeps those rules up to date.</p>
        `,
};
