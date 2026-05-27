export default {
  es: `
          <p>Hasta ahora trabajamos exclusivamente con Services de tipo <code>ClusterIP</code>: una IP virtual accesible solo desde dentro del cluster. Kubernetes tiene cuatro tipos de Service, y cada uno extiende al anterior. Entender la jerarquía hace que la elección sea obvia en cada situación.</p>

          <h2>ClusterIP</h2>

          <p>Es el tipo por defecto y el que ya diseccionamos. Asigna una IP virtual del rango configurado en el API server, accesible únicamente desde dentro del cluster. No tiene ningún mecanismo de exposición externa. Es la base sobre la que se construyen los otros tipos.</p>

          <h2>NodePort</h2>

          <p>Extiende ClusterIP abriendo un puerto en el rango <code>30000–32767</code> en cada nodo del cluster — incluyendo el controlplane. El tráfico que llega a ese puerto en cualquier nodo es redirigido al Service.</p>

          <pre><code>kubectl expose deploy nginx --port 80 --type NodePort

kubectl get svc nginx
# NAME    TYPE       CLUSTER-IP       EXTERNAL-IP   PORT(S)        AGE
# nginx   NodePort   10.102.127.174   &lt;none&gt;        80:31138/TCP   6s</code></pre>

          <p>El port <code>31138</code> se abrió en todos los nodos. Para ver las reglas que kube-proxy instaló en la chain <code>KUBE-NODEPORTS</code>:</p>

          <pre><code>iptables -t nat -L KUBE-NODEPORTS -n --line-numbers
# Chain KUBE-NODEPORTS (1 references)
# num  target                       prot  opt  source        destination
# 1    KUBE-EXT-2CMXP7HKUVJN7L6M   6     --   0.0.0.0/0     127.0.0.0/8   /* default/nginx */ tcp dpt:31138 nfacct-name localhost_nps_accepted_pkts
# 2    KUBE-EXT-2CMXP7HKUVJN7L6M   6     --   0.0.0.0/0     0.0.0.0/0     /* default/nginx */ tcp dpt:31138</code></pre>

          <p>A diferencia de ClusterIP, el tráfico NodePort no salta directo a <code>KUBE-SVC-*</code> — pasa primero por una chain intermedia <code>KUBE-EXT-*</code>. La regla 1 cubre tráfico desde localhost con un contador de auditoría (<code>nfacct</code>); la regla 2 cubre todo el resto. Ambas van a la misma chain. Inspeccionándola:</p>

          <pre><code>iptables -t nat -L KUBE-EXT-2CMXP7HKUVJN7L6M -n --line-numbers
# Chain KUBE-EXT-2CMXP7HKUVJN7L6M (2 references)
# num  target                      prot  opt  source      destination
# 1    KUBE-MARK-MASQ              0     --   0.0.0.0/0   0.0.0.0/0   /* masquerade traffic for default/nginx external destinations */
# 2    KUBE-SVC-2CMXP7HKUVJN7L6M  0     --   0.0.0.0/0   0.0.0.0/0</code></pre>

          <p>La diferencia clave con ClusterIP está en la regla 1: <code>KUBE-EXT-*</code> aplica <code>KUBE-MARK-MASQ</code> a <em>todo</em> el tráfico externo sin excepción, mientras que en <code>KUBE-SVC-*</code> el masquerading solo aplica a tráfico cuyo origen no está en el pod CIDR (<code>!192.168.0.0/16</code>). El tráfico que entra por NodePort siempre necesita masquerading porque su IP de origen es externa al cluster — sin eso, la respuesta del Pod no podría volver por el mismo camino. Después del marcado, la regla 2 salta a <code>KUBE-SVC-*</code>, donde ocurre el load balancing estadístico y el DNAT exactamente igual que en ClusterIP. El flujo completo es: <code>KUBE-NODEPORTS</code> → <code>KUBE-EXT-*</code> → <code>KUBE-MARK-MASQ</code> + <code>KUBE-SVC-*</code> → <code>KUBE-SEP-*</code> → DNAT.</p>

          <p>NodePort es útil para exposición directa en bare metal o para integrar con load balancers externos sin integración nativa con Kubernetes. Su limitación es que expone un puerto en todos los nodos — si el cliente apunta a un nodo que no tiene ningún Pod del Service, el tráfico igualmente llega, pero kube-proxy lo redirige a un Pod en otro nodo, agregando un hop de red innecesario.</p>

          <h2>LoadBalancer</h2>

          <p>Extiende NodePort agregando un balanceador de carga externo aprovisionado automáticamente. Cuando creas un Service de tipo <code>LoadBalancer</code> en un cluster con un cloud controller manager — GKE, EKS, AKS — Kubernetes le pide al proveedor que cree un LB externo apuntando a los NodePorts de todos los nodos.</p>

          <pre><code>kubectl expose deploy nginx --port 80 --type LoadBalancer

kubectl get svc nginx
# NAME    TYPE           CLUSTER-IP       EXTERNAL-IP   PORT(S)        AGE
# nginx   LoadBalancer   10.110.151.121   &lt;pending&gt;     80:31228/TCP   4s</code></pre>

          <p>El campo <code>EXTERNAL-IP</code> lo asigna el cloud controller manager una vez que el LB externo está listo. En un cluster sin integración de nube — como este laboratorio — ese campo se queda en <code>&lt;pending&gt;</code> indefinidamente. En bare metal, herramientas como MetalLB implementan el mismo protocolo para asignar IPs externas desde un rango configurado.</p>

          <p>Internamente, <code>LoadBalancer</code> sigue siendo un NodePort más un ClusterIP. El LB externo solo sabe de las IPs y puertos de los nodos — no habla directamente con los Pods. Todo el routing interno sigue siendo kube-proxy con las mismas chains que ya conocemos.</p>

          <h2>ExternalName</h2>

          <p>Es el tipo más diferente — no crea ninguna ClusterIP ni ninguna regla iptables. En lugar de eso, hace que CoreDNS devuelva un registro <code>CNAME</code> apuntando a un nombre externo. Es un alias DNS puro.</p>

          <pre><code>kubectl create service externalname mi-db \
  --external-name db.produccion.ejemplo.com

kubectl get svc mi-db
# NAME    TYPE           CLUSTER-IP   EXTERNAL-IP                    PORT(S)   AGE
# mi-db   ExternalName   &lt;none&gt;       db.produccion.ejemplo.com      &lt;none&gt;    5s</code></pre>

          <p>Cuando un Pod resuelve <code>mi-db.default.svc.cluster.local</code>, CoreDNS devuelve un CNAME a <code>db.produccion.ejemplo.com</code>, y el Pod resuelve ese nombre directamente. No hay proxying, no hay DNAT, no hay kube-proxy involucrado. Es útil para crear un nombre interno estable que apunta a un recurso externo — una base de datos managed, una API de terceros — sin cambiar el código de la aplicación cuando ese recurso cambia de dirección.</p>

          <h2>Headless Service</h2>

          <p>Un Headless Service no es un tipo separado — es un ClusterIP con <code>clusterIP: None</code> explícito. Kubernetes no le asigna ninguna IP virtual y kube-proxy no instala ninguna regla iptables para él. En cambio, CoreDNS devuelve directamente los registros A de cada Pod.</p>

          <pre><code>kubectl apply -f - &lt;&lt;EOF
apiVersion: v1
kind: Service
metadata:
  name: nginx-headless
spec:
  clusterIP: None
  selector:
    app: nginx
  ports:
  - port: 80
EOF

kubectl get svc nginx-headless
# NAME             TYPE        CLUSTER-IP   EXTERNAL-IP   PORT(S)   AGE
# nginx-headless   ClusterIP   None         &lt;none&gt;        80/TCP    6s</code></pre>

          <p>Al resolver el nombre desde un Pod:</p>

          <pre><code>kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup nginx-headless
# Server:    10.96.0.10
# Address:   10.96.0.10:53
#
# Name:   nginx-headless.default.svc.cluster.local
# Address: 192.168.1.6
# Name:   nginx-headless.default.svc.cluster.local
# Address: 192.168.1.7
# Name:   nginx-headless.default.svc.cluster.local
# Address: 192.168.1.5</code></pre>

          <p>DNS devuelve las tres IPs de los Pods directamente, sin ClusterIP intermedia. Cada dirección tiene el FQDN del Service como nombre — no el nombre individual del Pod — porque el selector del Service matchea los tres. El cliente elige a cuál conectarse.</p>

          <p>Los Headless Services son la base de los StatefulSets: cada Pod de un StatefulSet tiene un registro DNS estable y predecible (<code>pod-0.servicio.namespace.svc.cluster.local</code>) que apunta directamente a ese Pod específico. Eso es lo que permite que bases de datos como Cassandra o Kafka, donde cada réplica tiene un rol distinto, sean direccionables individualmente.</p>
        `,
  en: `
          <p>Until now we worked exclusively with <code>ClusterIP</code> Services: a virtual IP accessible only from inside the cluster. Kubernetes has four Service types, and each one extends the previous. Understanding the hierarchy makes the choice obvious in every situation.</p>

          <h2>ClusterIP</h2>

          <p>This is the default type and the one we already dissected. It assigns a virtual IP from the range configured in the API server, accessible only from inside the cluster. It has no external exposure mechanism. It is the foundation on which the other types are built.</p>

          <h2>NodePort</h2>

          <p>Extends ClusterIP by opening a port in the range <code>30000–32767</code> on every node in the cluster — including the controlplane. Traffic arriving at that port on any node is redirected to the Service.</p>

          <pre><code>kubectl expose deploy nginx --port 80 --type NodePort

kubectl get svc nginx
# NAME    TYPE       CLUSTER-IP       EXTERNAL-IP   PORT(S)        AGE
# nginx   NodePort   10.102.127.174   &lt;none&gt;        80:31138/TCP   6s</code></pre>

          <p>Port <code>31138</code> was opened on all nodes. To see the rules kube-proxy installed in the <code>KUBE-NODEPORTS</code> chain:</p>

          <pre><code>iptables -t nat -L KUBE-NODEPORTS -n --line-numbers
# Chain KUBE-NODEPORTS (1 references)
# num  target                       prot  opt  source        destination
# 1    KUBE-EXT-2CMXP7HKUVJN7L6M   6     --   0.0.0.0/0     127.0.0.0/8   /* default/nginx */ tcp dpt:31138 nfacct-name localhost_nps_accepted_pkts
# 2    KUBE-EXT-2CMXP7HKUVJN7L6M   6     --   0.0.0.0/0     0.0.0.0/0     /* default/nginx */ tcp dpt:31138</code></pre>

          <p>Unlike ClusterIP, NodePort traffic does not jump directly to <code>KUBE-SVC-*</code> — it first goes through an intermediate <code>KUBE-EXT-*</code> chain. Rule 1 covers localhost traffic with an audit counter (<code>nfacct</code>); rule 2 covers everything else. Both go to the same chain. Inspecting it:</p>

          <pre><code>iptables -t nat -L KUBE-EXT-2CMXP7HKUVJN7L6M -n --line-numbers
# Chain KUBE-EXT-2CMXP7HKUVJN7L6M (2 references)
# num  target                      prot  opt  source      destination
# 1    KUBE-MARK-MASQ              0     --   0.0.0.0/0   0.0.0.0/0   /* masquerade traffic for default/nginx external destinations */
# 2    KUBE-SVC-2CMXP7HKUVJN7L6M  0     --   0.0.0.0/0   0.0.0.0/0</code></pre>

          <p>The key difference from ClusterIP is in rule 1: <code>KUBE-EXT-*</code> applies <code>KUBE-MARK-MASQ</code> to <em>all</em> external traffic unconditionally, while in <code>KUBE-SVC-*</code> masquerading only applies to traffic whose source is outside the pod CIDR (<code>!192.168.0.0/16</code>). Traffic entering via NodePort always needs masquerading because its source IP is external to the cluster — without it, the Pod's response could not find its way back. After the marking, rule 2 jumps to <code>KUBE-SVC-*</code>, where statistical load balancing and DNAT happen exactly as in ClusterIP. The complete flow is: <code>KUBE-NODEPORTS</code> → <code>KUBE-EXT-*</code> → <code>KUBE-MARK-MASQ</code> + <code>KUBE-SVC-*</code> → <code>KUBE-SEP-*</code> → DNAT.</p>

          <p>NodePort is useful for direct exposure on bare metal or for integrating with external load balancers without native Kubernetes integration. Its limitation is that it exposes a port on every node — if the client points to a node that has no Pod for the Service, the traffic still arrives, but kube-proxy redirects it to a Pod on another node, adding an unnecessary network hop.</p>

          <h2>LoadBalancer</h2>

          <p>Extends NodePort by adding an automatically provisioned external load balancer. When you create a <code>LoadBalancer</code> Service in a cluster with a cloud controller manager — GKE, EKS, AKS — Kubernetes asks the provider to create an external LB pointing to the NodePorts of all nodes.</p>

          <pre><code>kubectl expose deploy nginx --port 80 --type LoadBalancer

kubectl get svc nginx
# NAME    TYPE           CLUSTER-IP       EXTERNAL-IP   PORT(S)        AGE
# nginx   LoadBalancer   10.110.151.121   &lt;pending&gt;     80:31228/TCP   4s</code></pre>

          <p>The <code>EXTERNAL-IP</code> field is assigned by the cloud controller manager once the external LB is ready. In a cluster without cloud integration — like this lab — that field stays at <code>&lt;pending&gt;</code> indefinitely. On bare metal, tools like MetalLB implement the same protocol to assign external IPs from a configured range.</p>

          <p>Internally, <code>LoadBalancer</code> is still a NodePort plus a ClusterIP. The external LB only knows about the node IPs and ports — it does not talk directly to the Pods. All internal routing is still kube-proxy with the same chains we already know.</p>

          <h2>ExternalName</h2>

          <p>This is the most different type — it creates no ClusterIP and no iptables rules. Instead, it makes CoreDNS return a <code>CNAME</code> record pointing to an external name. It is a pure DNS alias.</p>

          <pre><code>kubectl create service externalname my-db \
  --external-name db.production.example.com

kubectl get svc my-db
# NAME    TYPE           CLUSTER-IP   EXTERNAL-IP                     PORT(S)   AGE
# my-db   ExternalName   &lt;none&gt;       db.production.example.com       &lt;none&gt;    5s</code></pre>

          <p>When a Pod resolves <code>my-db.default.svc.cluster.local</code>, CoreDNS returns a CNAME to <code>db.production.example.com</code>, and the Pod resolves that name directly. No proxying, no DNAT, no kube-proxy involved. It is useful for creating a stable internal name that points to an external resource — a managed database, a third-party API — without changing application code when that resource changes address.</p>

          <h2>Headless Service</h2>

          <p>A Headless Service is not a separate type — it is a ClusterIP with an explicit <code>clusterIP: None</code>. Kubernetes assigns no virtual IP and kube-proxy installs no iptables rules for it. Instead, CoreDNS returns the A records of each Pod directly.</p>

          <pre><code>kubectl apply -f - &lt;&lt;EOF
apiVersion: v1
kind: Service
metadata:
  name: nginx-headless
spec:
  clusterIP: None
  selector:
    app: nginx
  ports:
  - port: 80
EOF

kubectl get svc nginx-headless
# NAME             TYPE        CLUSTER-IP   EXTERNAL-IP   PORT(S)   AGE
# nginx-headless   ClusterIP   None         &lt;none&gt;        80/TCP    6s</code></pre>

          <p>Resolving the name from a Pod:</p>

          <pre><code>kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup nginx-headless
# Server:    10.96.0.10
# Address:   10.96.0.10:53
#
# Name:   nginx-headless.default.svc.cluster.local
# Address: 192.168.1.6
# Name:   nginx-headless.default.svc.cluster.local
# Address: 192.168.1.7
# Name:   nginx-headless.default.svc.cluster.local
# Address: 192.168.1.5</code></pre>

          <p>DNS returns the three Pod IPs directly, with no intermediate ClusterIP. Each address carries the Service FQDN as the name — not the individual Pod name — because the Service selector matches all three. The client chooses which one to connect to.</p>

          <p>Headless Services are the foundation of StatefulSets: each Pod in a StatefulSet has a stable and predictable DNS record (<code>pod-0.service.namespace.svc.cluster.local</code>) that points directly to that specific Pod. That is what allows databases like Cassandra or Kafka, where each replica has a distinct role, to be individually addressable.</p>
        `,
};
