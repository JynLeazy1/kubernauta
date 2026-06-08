export default {
  es: `
          <p>Hasta ahora accedimos a los Services por su ClusterIP directamente. En la práctica, ningún código hardcodea esas IPs — usan nombres como <code>nginx</code> o <code>nginx.default.svc.cluster.local</code>. Eso funciona porque cada Pod tiene configurado un servidor DNS que resuelve esos nombres: CoreDNS.</p>

          <h2>CoreDNS en el cluster</h2>

          <p>CoreDNS corre como un Deployment en <code>kube-system</code> — a diferencia de kube-proxy, que es un DaemonSet, CoreDNS no necesita estar en cada nodo porque el tráfico DNS es tráfico de red normal que puede ir a cualquier Pod:</p>

          <pre><code>kubectl get pods -n kube-system -l k8s-app=kube-dns -o wide
# NAME                       READY   STATUS    NODE
# coredns-7db6d8ff4d-4xgkp   1/1     Running   controlplane
# coredns-7db6d8ff4d-9wt9h   1/1     Running   controlplane

kubectl get svc kube-dns -n kube-system
# NAME       TYPE        CLUSTER-IP   EXTERNAL-IP   PORT(S)                  AGE
# kube-dns   ClusterIP   10.96.0.10   &lt;none&gt;        53/UDP,53/TCP,9153/TCP   9d</code></pre>

          <p>La IP <code>10.96.0.10</code> es la ClusterIP del Service <code>kube-dns</code>. Es la misma IP que aparecía como servidor en el output de nslookup de la parte anterior. Esa IP no cambia entre reinicios — es una ClusterIP estable que apunta a los Pods de CoreDNS, igual que cualquier otro Service.</p>

          <h2>Cómo un Pod sabe a quién preguntarle</h2>

          <p>Cuando kubelet crea un Pod, configura su <code>/etc/resolv.conf</code> automáticamente. Puedes verlo desde dentro de cualquier contenedor:</p>

          <pre><code>kubectl exec -it nginx-66686b6766-4l9zs -- cat /etc/resolv.conf
# search default.svc.cluster.local svc.cluster.local cluster.local
# nameserver 10.96.0.10
# options ndots:5</code></pre>

          <p>Tres líneas, tres conceptos. <code>nameserver 10.96.0.10</code> le dice al resolver del Pod que todas las consultas DNS van a CoreDNS. <code>search default.svc.cluster.local svc.cluster.local cluster.local</code> son los dominios de búsqueda — cuando resuelves un nombre sin punto o con pocos componentes, el resolver los prueba en orden hasta encontrar una respuesta. <code>options ndots:5</code> define el umbral: si un nombre tiene menos de 5 puntos, se considera relativo y se prueban los search domains antes de intentarlo como FQDN absoluto.</p>

          <p>Eso explica por qué <code>curl http://nginx</code> funciona desde un Pod en el mismo namespace: el resolver expande <code>nginx</code> a <code>nginx.default.svc.cluster.local</code> automáticamente porque <code>default.svc.cluster.local</code> es el primer search domain.</p>

          <h2>El Corefile: configuración de CoreDNS</h2>

          <p>CoreDNS se configura a través de un ConfigMap llamado <code>coredns</code> en <code>kube-system</code>. El formato es el Corefile:</p>

          <pre><code>kubectl get configmap coredns -n kube-system -o yaml
# data:
#   Corefile: |
#     .:53 {
#         errors
#         health {
#            lameduck 5s
#         }
#         ready
#         kubernetes cluster.local in-addr.arpa ip6.arpa {
#            pods insecure
#            fallthrough in-addr.arpa ip6.arpa
#            ttl 30
#         }
#         prometheus :9153
#         forward . /etc/resolv.conf {
#            max_concurrent 1000
#         }
#         cache 30 {
#            disable success cluster.local
#            disable denial cluster.local
#         }
#         loop
#         reload
#         loadbalance
#     }</code></pre>

          <p>El bloque <code>kubernetes cluster.local</code> es el plugin que responde las consultas del cluster. Maneja el dominio <code>cluster.local</code> y las zonas de reverse DNS (<code>in-addr.arpa</code>, <code>ip6.arpa</code>). La directiva <code>pods insecure</code> habilita la resolución de Pods por IP en formato <code>ip-con-guiones.namespace.pod.cluster.local</code>. El bloque <code>forward . /etc/resolv.conf</code> envía cualquier consulta que no sea del cluster al DNS upstream del nodo.</p>

          <p>El bloque <code>cache 30</code> merece atención especial: tiene <code>disable success cluster.local</code> y <code>disable denial cluster.local</code>. Eso significa que CoreDNS <em>no cachea</em> las respuestas DNS para el dominio <code>cluster.local</code> — ni las exitosas ni las negativas. La razón es que los Services y Pods del cluster pueden cambiar en cualquier momento, y un cache stale podría hacer que un Pod resuelva una IP que ya no existe. El cache de 30 segundos aplica solo para consultas externas que van al upstream.</p>

          <h2>Qué devuelve CoreDNS según el tipo de Service</h2>

          <p>Para un Service ClusterIP normal, CoreDNS devuelve un registro A con la ClusterIP. Para un Service Headless (<code>clusterIP: None</code>), devuelve un registro A por cada Pod que esté <code>ready</code>. Para un Service ExternalName, devuelve un CNAME al nombre externo configurado. El TTL por defecto es 30 segundos, configurable en el Corefile.</p>

          <p>Para Services con puertos con nombre, CoreDNS también publica registros SRV que permiten descubrir tanto el puerto como el protocolo. Para esto el Service necesita que el puerto tenga un <code>name</code> explícito en su spec:</p>

          <pre><code>kubectl apply -f web.yaml
# deployment.apps/web created
# service/web created

kubectl get svc web
# NAME   TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE
# web    ClusterIP   10.104.218.185   &lt;none&gt;        80/TCP    16s</code></pre>

          <pre><code>kubectl run -it --rm debug --image=busybox --restart=Never -- \
  nslookup -type=SRV _http._tcp.web.default.svc.cluster.local
# Server:   10.96.0.10
# Address:  10.96.0.10:53
#
# _http._tcp.web.default.svc.cluster.local  service = 0 100 80 web.default.svc.cluster.local</code></pre>

          <p>El registro SRV devuelve cuatro campos: prioridad (<code>0</code>), peso (<code>100</code>), puerto (<code>80</code>), y el hostname destino (<code>web.default.svc.cluster.local</code>). Un cliente que soporte descubrimiento via SRV puede resolver el nombre del Service sin necesitar conocer el puerto de antemano — lo obtiene del propio DNS.</p>

          <h2>DNS para Pods individuales</h2>

          <p>Además de los Services, CoreDNS puede resolver Pods directamente usando su IP con guiones en lugar de puntos. La IP <code>192.168.1.5</code> se convierte en <code>192-168-1-5.default.pod.cluster.local</code>:</p>

          <pre><code>kubectl exec -it nginx-66686b6766-4l9zs -- nslookup 192-168-1-5.default.pod.cluster.local
# Name:   192-168-1-5.default.pod.cluster.local
# Address: 192.168.1.5</code></pre>

          <p>Esta resolución la habilita <code>pods insecure</code> en el Corefile. Se llama "insecure" porque cualquier Pod puede consultar la IP de cualquier otro Pod por nombre — no hay validación de que el Pod que pregunta tenga permiso para conocer esa IP.</p>

          <h2>ndots:5 y el costo oculto del DNS</h2>

          <p>El <code>/etc/resolv.conf</code> tiene <code>options ndots:5</code>. La documentación dice que si un nombre tiene menos de 5 puntos, se prueban los search domains antes de intentarlo como nombre absoluto. Para verificarlo, lo más obvio es capturar el tráfico DNS mientras resolvemos un nombre externo desde un Pod:</p>

          <pre><code>tcpdump -i any -nn 'port 53' -l | grep api.google.com
# 192.168.1.7.45444 > 192.168.0.5.53: A?    api.google.com. (32)
# 192.168.1.7.45444 > 192.168.0.5.53: AAAA? api.google.com. (32)
# 192.168.0.5 > 8.8.8.8.53:           AAAA? api.google.com. (32)
# 192.168.0.5 > 1.1.1.1.53:           A?    api.google.com. (32)</code></pre>

          <p>Raro — solo dos queries, directo a <code>api.google.com.</code> sin ningún intento con search domains. Y CoreDNS reenvía al upstream en paralelo a <code>8.8.8.8</code> y <code>1.1.1.1</code> simultáneamente. ¿Dónde está el cascade de ndots?</p>

          <p>La respuesta está en qué herramienta hace la consulta. <code>nslookup</code> hace queries DNS directas sin pasar por el resolver de la librería C — ignora el <code>ndots</code> y los search domains por completo. Para ver el comportamiento real hay que usar una aplicación que use <code>getaddrinfo()</code>.</p>

          <p>Habilitamos el plugin <code>log</code> en CoreDNS para ver todas las queries en tiempo real:</p>

          <pre><code>kubectl edit configmap coredns -n kube-system   # agregar 'log' al bloque .:53
kubectl rollout restart deployment coredns -n kube-system
kubectl logs -n kube-system -l k8s-app=kube-dns -f</code></pre>

          <p>Y en otra terminal, corremos <code>apt update</code> dentro de uno de los Pods nginx — apt usa <code>getaddrinfo()</code> para resolver <code>deb.debian.org</code>. Lo que aparece en los logs de CoreDNS:</p>

          <pre><code># [INFO] 192.168.1.5 - "AAAA IN deb.debian.org.default.svc.cluster.local." NXDOMAIN  0.000187s
# [INFO] 192.168.1.5 - "A    IN deb.debian.org.default.svc.cluster.local." NXDOMAIN  0.001814s
# [INFO] 192.168.1.5 - "AAAA IN deb.debian.org.svc.cluster.local."         NXDOMAIN  0.000119s
# [INFO] 192.168.1.5 - "A    IN deb.debian.org.svc.cluster.local."         NXDOMAIN  0.000114s
# [INFO] 192.168.1.5 - "AAAA IN deb.debian.org.cluster.local."             NXDOMAIN  0.000289s
# [INFO] 192.168.1.5 - "A    IN deb.debian.org.cluster.local."             NXDOMAIN  0.000999s
# [INFO] 192.168.1.5 - "A    IN deb.debian.org."                           NOERROR   0.024114s
# [INFO] 192.168.1.5 - "AAAA IN deb.debian.org."                           NOERROR   0.024444s</code></pre>

          <p>Ahí está. 8 queries para resolver un dominio: A y AAAA para cada uno de los tres search domains — seis NXDOMAINs — antes de llegar al nombre absoluto correcto. <code>deb.debian.org</code> tiene 2 puntos, menos de 5, entonces el resolver de libc recorre todos los search domains primero. Esto le pasa a cualquier aplicación que use <code>getaddrinfo()</code>: Go, Python, Node.js, Java — todas siguen las mismas reglas del resolver.</p>

          <p>Para evitarlo, el punto final explícito es suficiente: <code>curl http://deb.debian.org.</code> indica al resolver que es un FQDN absoluto y va directo al upstream. En producción también es común reducir <code>ndots</code> a 2 o 3 en el <code>dnsConfig</code> del Pod para aplicaciones que hacen muchas llamadas externas. Una vez terminada la verificación, remové el plugin <code>log</code> del Corefile y reiniciá CoreDNS — loggear cada query en producción tiene un costo no trivial.</p>
        `,
  en: `
          <p>Until now we accessed Services directly by their ClusterIP. In practice, no code hardcodes those IPs — it uses names like <code>nginx</code> or <code>nginx.default.svc.cluster.local</code>. That works because every Pod has a DNS server configured that resolves those names: CoreDNS.</p>

          <h2>CoreDNS in the cluster</h2>

          <p>CoreDNS runs as a Deployment in <code>kube-system</code> — unlike kube-proxy, which is a DaemonSet, CoreDNS does not need to be on every node because DNS traffic is normal network traffic that can go to any Pod:</p>

          <pre><code>kubectl get pods -n kube-system -l k8s-app=kube-dns -o wide
# NAME                       READY   STATUS    NODE
# coredns-7db6d8ff4d-4xgkp   1/1     Running   controlplane
# coredns-7db6d8ff4d-9wt9h   1/1     Running   controlplane

kubectl get svc kube-dns -n kube-system
# NAME       TYPE        CLUSTER-IP   EXTERNAL-IP   PORT(S)                  AGE
# kube-dns   ClusterIP   10.96.0.10   &lt;none&gt;        53/UDP,53/TCP,9153/TCP   9d</code></pre>

          <p>The IP <code>10.96.0.10</code> is the ClusterIP of the <code>kube-dns</code> Service. It is the same IP that appeared as the server in the nslookup output from the previous part. That IP does not change between restarts — it is a stable ClusterIP pointing to the CoreDNS Pods, just like any other Service.</p>

          <h2>How a Pod knows who to ask</h2>

          <p>When kubelet creates a Pod, it automatically configures its <code>/etc/resolv.conf</code>. You can see it from inside any container:</p>

          <pre><code>kubectl exec -it nginx-66686b6766-4l9zs -- cat /etc/resolv.conf
# search default.svc.cluster.local svc.cluster.local cluster.local
# nameserver 10.96.0.10
# options ndots:5</code></pre>

          <p>Three lines, three concepts. <code>nameserver 10.96.0.10</code> tells the Pod's resolver that all DNS queries go to CoreDNS. <code>search default.svc.cluster.local svc.cluster.local cluster.local</code> are the search domains — when you resolve a name with no dots or few components, the resolver tries them in order until it finds a response. <code>options ndots:5</code> defines the threshold: if a name has fewer than 5 dots, it is treated as relative and the search domains are tried before attempting it as an absolute FQDN.</p>

          <p>That is why <code>curl http://nginx</code> works from a Pod in the same namespace: the resolver automatically expands <code>nginx</code> to <code>nginx.default.svc.cluster.local</code> because <code>default.svc.cluster.local</code> is the first search domain.</p>

          <h2>The Corefile: CoreDNS configuration</h2>

          <p>CoreDNS is configured through a ConfigMap named <code>coredns</code> in <code>kube-system</code>. The format is the Corefile:</p>

          <pre><code>kubectl get configmap coredns -n kube-system -o yaml
# data:
#   Corefile: |
#     .:53 {
#         errors
#         health {
#            lameduck 5s
#         }
#         ready
#         kubernetes cluster.local in-addr.arpa ip6.arpa {
#            pods insecure
#            fallthrough in-addr.arpa ip6.arpa
#            ttl 30
#         }
#         prometheus :9153
#         forward . /etc/resolv.conf {
#            max_concurrent 1000
#         }
#         cache 30 {
#            disable success cluster.local
#            disable denial cluster.local
#         }
#         loop
#         reload
#         loadbalance
#     }</code></pre>

          <p>The <code>kubernetes cluster.local</code> block is the plugin that answers cluster queries. It handles the <code>cluster.local</code> domain and the reverse DNS zones (<code>in-addr.arpa</code>, <code>ip6.arpa</code>). The <code>pods insecure</code> directive enables Pod resolution by IP in the format <code>ip-with-dashes.namespace.pod.cluster.local</code>. The <code>forward . /etc/resolv.conf</code> block sends any query that is not for the cluster to the node's upstream DNS.</p>

          <p>The <code>cache 30</code> block deserves special attention: it has <code>disable success cluster.local</code> and <code>disable denial cluster.local</code>. That means CoreDNS does <em>not</em> cache DNS responses for the <code>cluster.local</code> domain — neither successful nor negative ones. The reason is that cluster Services and Pods can change at any moment, and a stale cache could cause a Pod to resolve an IP that no longer exists. The 30-second cache applies only to external queries that go to the upstream.</p>

          <h2>What CoreDNS returns per Service type</h2>

          <p>For a normal ClusterIP Service, CoreDNS returns an A record with the ClusterIP. For a Headless Service (<code>clusterIP: None</code>), it returns one A record per <code>ready</code> Pod. For an ExternalName Service, it returns a CNAME to the configured external name. The default TTL is 30 seconds, configurable in the Corefile.</p>

          <p>For Services with named ports, CoreDNS also publishes SRV records that allow discovering both the port and the protocol. For this the Service needs an explicit <code>name</code> on its port in the spec:</p>

          <pre><code>kubectl apply -f web.yaml
# deployment.apps/web created
# service/web created

kubectl get svc web
# NAME   TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE
# web    ClusterIP   10.104.218.185   &lt;none&gt;        80/TCP    16s</code></pre>

          <pre><code>kubectl run -it --rm debug --image=busybox --restart=Never -- \
  nslookup -type=SRV _http._tcp.web.default.svc.cluster.local
# Server:   10.96.0.10
# Address:  10.96.0.10:53
#
# _http._tcp.web.default.svc.cluster.local  service = 0 100 80 web.default.svc.cluster.local</code></pre>

          <p>The SRV record returns four fields: priority (<code>0</code>), weight (<code>100</code>), port (<code>80</code>), and the target hostname (<code>web.default.svc.cluster.local</code>). A client that supports SRV-based discovery can resolve the Service name without needing to know the port in advance — it gets it from DNS itself.</p>

          <h2>DNS for individual Pods</h2>

          <p>Beyond Services, CoreDNS can resolve Pods directly using their IP with dashes instead of dots. The IP <code>192.168.1.5</code> becomes <code>192-168-1-5.default.pod.cluster.local</code>:</p>

          <pre><code>kubectl exec -it nginx-66686b6766-4l9zs -- nslookup 192-168-1-5.default.pod.cluster.local
# Name:   192-168-1-5.default.pod.cluster.local
# Address: 192.168.1.5</code></pre>

          <p>This resolution is enabled by <code>pods insecure</code> in the Corefile. It is called "insecure" because any Pod can query the IP of any other Pod by name — there is no validation that the querying Pod has permission to know that IP.</p>

          <h2>ndots:5 and the hidden DNS cost</h2>

          <p>The <code>/etc/resolv.conf</code> has <code>options ndots:5</code>. The documentation says that if a name has fewer than 5 dots, the search domains are tried before attempting it as an absolute name. To verify it, the most obvious thing is to capture DNS traffic while resolving an external name from a Pod:</p>

          <pre><code>tcpdump -i any -nn 'port 53' -l | grep api.google.com
# 192.168.1.7.45444 > 192.168.0.5.53: A?    api.google.com. (32)
# 192.168.1.7.45444 > 192.168.0.5.53: AAAA? api.google.com. (32)
# 192.168.0.5 > 8.8.8.8.53:           AAAA? api.google.com. (32)
# 192.168.0.5 > 1.1.1.1.53:           A?    api.google.com. (32)</code></pre>

          <p>Odd — only two queries, going straight to <code>api.google.com.</code> with no search domain attempts at all. And CoreDNS forwards to the upstream in parallel to both <code>8.8.8.8</code> and <code>1.1.1.1</code> simultaneously. Where is the ndots cascade?</p>

          <p>The answer is in which tool is making the query. <code>nslookup</code> makes direct DNS queries without going through the C library resolver — it ignores <code>ndots</code> and search domains entirely. To see the real behavior you need an application that uses <code>getaddrinfo()</code>.</p>

          <p>We enable the <code>log</code> plugin in CoreDNS to see all queries in real time:</p>

          <pre><code>kubectl edit configmap coredns -n kube-system   # add 'log' to the .:53 block
kubectl rollout restart deployment coredns -n kube-system
kubectl logs -n kube-system -l k8s-app=kube-dns -f</code></pre>

          <p>And in another terminal, we run <code>apt update</code> inside one of the nginx Pods — apt uses <code>getaddrinfo()</code> to resolve <code>deb.debian.org</code>. What appears in the CoreDNS logs:</p>

          <pre><code># [INFO] 192.168.1.5 - "AAAA IN deb.debian.org.default.svc.cluster.local." NXDOMAIN  0.000187s
# [INFO] 192.168.1.5 - "A    IN deb.debian.org.default.svc.cluster.local." NXDOMAIN  0.001814s
# [INFO] 192.168.1.5 - "AAAA IN deb.debian.org.svc.cluster.local."         NXDOMAIN  0.000119s
# [INFO] 192.168.1.5 - "A    IN deb.debian.org.svc.cluster.local."         NXDOMAIN  0.000114s
# [INFO] 192.168.1.5 - "AAAA IN deb.debian.org.cluster.local."             NXDOMAIN  0.000289s
# [INFO] 192.168.1.5 - "A    IN deb.debian.org.cluster.local."             NXDOMAIN  0.000999s
# [INFO] 192.168.1.5 - "A    IN deb.debian.org."                           NOERROR   0.024114s
# [INFO] 192.168.1.5 - "AAAA IN deb.debian.org."                           NOERROR   0.024444s</code></pre>

          <p>There it is. 8 queries to resolve one domain: A and AAAA for each of the three search domains — six NXDOMAINs — before reaching the correct absolute name. <code>deb.debian.org</code> has 2 dots, fewer than 5, so the libc resolver walks through all the search domains first. This happens to any application using <code>getaddrinfo()</code>: Go, Python, Node.js, Java — all of them follow the same resolver rules.</p>

          <p>To avoid it, the explicit trailing dot is enough: <code>curl http://deb.debian.org.</code> signals to the resolver that it is an absolute FQDN and sends it directly to the upstream. In production it is also common to reduce <code>ndots</code> to 2 or 3 in the Pod's <code>dnsConfig</code> for applications that make many external calls. Once done with the verification, remove the <code>log</code> plugin from the Corefile and restart CoreDNS — logging every query in production has a non-trivial cost.</p>
        `,
}
