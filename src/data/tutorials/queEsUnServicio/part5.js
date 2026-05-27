export default {
  es: `
          <p>Cuando corrimos <code>kubectl get ep nginx</code> en la parte anterior, el cluster emitió un warning:</p>

          <pre><code>kubectl get ep nginx
# Warning: v1 Endpoints is deprecated in v1.33+; use discovery.k8s.io/v1 EndpointSlice
# NAME    ENDPOINTS                                      AGE
# nginx   192.168.1.4:80,192.168.1.5:80,192.168.1.6:80  49s</code></pre>

          <p>El objeto <code>Endpoints</code> fue la forma original de rastrear los Pods detrás de un Service. Todavía funciona, pero fue reemplazado por <code>EndpointSlice</code>. Para entender por qué, hay que entender el problema que resuelve.</p>

          <h2>El problema de escala del objeto Endpoints</h2>

          <p>El objeto <code>Endpoints</code> original pone todos los endpoints de un Service en un solo objeto etcd. Con un Service que tiene 1000 réplicas — común en aplicaciones de gran escala — ese objeto ocupa decenas de kilobytes. Cada vez que un Pod se agrega, elimina o cambia de estado, el API server escribe el objeto entero de nuevo y lo distribuye a todos los nodos del cluster. Con miles de nodos, eso es una cantidad de tráfico enorme para un cambio de un solo Pod.</p>

          <p>EndpointSlice resuelve el problema de escala con una idea simple: en lugar de un objeto gigante, se crean múltiples slices de máximo 100 endpoints cada uno. Cuando un Pod cambia, solo el slice que lo contiene necesita actualizarse — y solo ese slice se distribuye por la red. El resto permanece sin cambios.</p>

          <h2>Inspeccionar los EndpointSlices de un Service</h2>

          <p>Cada EndpointSlice tiene una label <code>kubernetes.io/service-name</code> que lo vincula a su Service. Para verlos:</p>

          <pre><code>kubectl get endpointslices
# NAME          ADDRESSTYPE   PORTS   ENDPOINTS                             AGE
# kubernetes    IPv4          6443    172.30.1.2                            9d
# nginx-bkx2b   IPv4          80      192.168.1.5,192.168.1.6,192.168.1.4   47m</code></pre>

          <p>Con tres réplicas entra todo en un solo slice. Para ver la estructura completa:</p>

          <pre><code>kubectl get endpointslice nginx-bkx2b -o yaml
# addressType: IPv4
# apiVersion: discovery.k8s.io/v1
# endpoints:
# - addresses:
#   - 192.168.1.5
#   conditions:
#     ready: true
#     serving: true
#     terminating: false
#   nodeName: node01
#   targetRef:
#     kind: Pod
#     name: nginx-66686b6766-cp47m
#     namespace: default
#     uid: 5e229a31-f253-46d2-90d0-ab9a1eee47e5
# - addresses:
#   - 192.168.1.6
#   conditions:
#     ready: true
#     serving: true
#     terminating: false
#   nodeName: node01
#   targetRef:
#     kind: Pod
#     name: nginx-66686b6766-tk7qv
#     namespace: default
#     uid: c2349683-3adf-48ce-a381-250088ffb13c
# - addresses:
#   - 192.168.1.4
#   conditions:
#     ready: true
#     serving: true
#     terminating: false
#   nodeName: node01
#   targetRef:
#     kind: Pod
#     name: nginx-66686b6766-74zs8
#     namespace: default
#     uid: 8affde90-1f17-4103-88db-23c085fc1761
# kind: EndpointSlice
# metadata:
#   annotations:
#     endpoints.kubernetes.io/last-change-trigger-time: "2026-04-10T21:04:52Z"
#   generateName: nginx-
#   generation: 1
#   labels:
#     app: nginx
#     endpointslice.kubernetes.io/managed-by: endpointslice-controller.k8s.io
#     kubernetes.io/service-name: nginx
#   name: nginx-bkx2b
#   namespace: default
#   ownerReferences:
#   - apiVersion: v1
#     blockOwnerDeletion: true
#     controller: true
#     kind: Service
#     name: nginx
#     uid: 909643ef-167b-4f65-9b23-e2c6f645c290
# ports:
# - name: ""
#   port: 80
#   protocol: TCP</code></pre>

          <p>El campo <code>ownerReferences</code> establece la relación de ownership: el Service es dueño del slice. Si se elimina el Service, el garbage collector de Kubernetes elimina el EndpointSlice automáticamente. El campo <code>generateName: nginx-</code> explica por qué el nombre del slice es <code>nginx-bkx2b</code> — es un prefijo con un sufijo aleatorio generado por el API server.</p>

          <h2>Las tres condiciones de un endpoint</h2>

          <p>Cada endpoint dentro de un slice tiene tres condiciones booleanas independientes. <code>ready</code> indica si el Pod pasó sus readiness probes y está listo para recibir tráfico normal. <code>serving</code> es similar a <code>ready</code> pero permanece en <code>true</code> durante el graceful shutdown del Pod — permite que las conexiones existentes terminen mientras el Pod se está apagando. <code>terminating</code> se pone en <code>true</code> cuando el Pod recibió una señal SIGTERM y está en proceso de cierre.</p>

          <p>kube-proxy solo agrega un endpoint a las reglas iptables si <code>ready: true</code>. Cuando un Pod empieza a terminar, <code>terminating</code> pasa a <code>true</code> y <code>ready</code> pasa a <code>false</code> — kube-proxy lo elimina de las chains <code>KUBE-SVC-*</code> inmediatamente. El Pod puede terminar de procesar las conexiones existentes gracias a conntrack, que ya tiene registradas esas conexiones, pero no recibirá tráfico nuevo.</p>

          <h2>nodeName y el routing topológico</h2>

          <p>Cada endpoint incluye el campo <code>nodeName</code> con el nodo donde corre el Pod. Kubernetes usa ese campo — junto con un campo adicional llamado <code>hints</code> — para implementar <a href="https://kubernetes.io/docs/concepts/services-networking/topology-aware-routing/" target="_blank"><em>topology-aware routing</em></a>: preferir endpoints en el mismo nodo o zona que el cliente antes de cruzar zonas de disponibilidad. Eso reduce latencia y costo de tráfico entre zonas en clusters multi-AZ.</p>

          <p>Para activarlo, se agrega la annotation <code>service.kubernetes.io/topology-mode: Auto</code> al Service. El controlador de EndpointSlices calcula entonces qué endpoints deben usarse en cada zona y lo anota en el campo <code>hints.forZones</code> de cada endpoint en el slice:</p>

          <pre><code># Con topology-mode: Auto, el slice incluye hints por zona
# endpoints:
# - addresses:
#   - 192.168.1.5
#   hints:
#     forZones:
#     - name: us-east-1a
#   nodeName: node01
#   zone: us-east-1a</code></pre>

          <p>kube-proxy lee esos hints y filtra los endpoints al momento de construir las reglas: un nodo en <code>us-east-1a</code> solo incluirá en su <code>KUBE-SVC-*</code> los endpoints marcados con <code>forZones: us-east-1a</code>. El tráfico nunca sale de la zona salvo que no haya endpoints disponibles en ella. La implementación vive en <a href="https://github.com/kubernetes/kubernetes/blob/master/pkg/proxy/topology.go" target="_blank"><code>pkg/proxy/topology.go</code></a>, función <code>CategorizeEndpoints()</code>.</p>

          <p>La feature se llamaba <em>Topology Aware Hints</em> hasta Kubernetes 1.26 y fue renombrada a <em>Topology Aware Routing</em> en 1.27. La annotation legacy <code>service.kubernetes.io/topology-aware-hints</code> sigue siendo soportada por compatibilidad.</p>

          <h2>Cómo kube-proxy consume los EndpointSlices</h2>

          <p>kube-proxy no consulta los EndpointSlices en polling — los observa via un Informer, el mismo mecanismo de watch que vimos en la parte 3. Cada vez que un EndpointSlice cambia — porque un Pod se agregó, eliminó, o cambió de condición — kube-proxy recibe el evento y sincroniza las reglas iptables del nodo. Para verificarlo, eliminamos un Pod y observamos las reglas inmediatamente:</p>

          <pre><code>kubectl delete pod nginx-66686b6766-74zs8
# pod "nginx-66686b6766-74zs8" deleted

kubectl get pods -o wide
# NAME                     READY   IP            NODE
# nginx-66686b6766-cp47m   1/1     192.168.1.5   node01
# nginx-66686b6766-tfww9   1/1     192.168.1.7   node01   ← nuevo Pod, IP nueva
# nginx-66686b6766-tk7qv   1/1     192.168.1.6   node01

sudo iptables -t nat -L KUBE-SVC-2CMXP7HKUVJN7L6M -n --line-numbers
# Chain KUBE-SVC-2CMXP7HKUVJN7L6M (1 references)
# num  target                       prot  opt  source           destination
# 1    KUBE-MARK-MASQ               6     --   !192.168.0.0/16  10.99.20.216   tcp dpt:80
# 2    KUBE-SEP-BD6TRYPAX6RNC2PD   0     --   0.0.0.0/0        0.0.0.0/0      /* -> 192.168.1.5:80 */ statistic mode random probability 0.33333333349
# 3    KUBE-SEP-XBSUSKRGZRORR4T6   0     --   0.0.0.0/0        0.0.0.0/0      /* -> 192.168.1.6:80 */ statistic mode random probability 0.50000000000
# 4    KUBE-SEP-4AGQXI4GR55VNW45   0     --   0.0.0.0/0        0.0.0.0/0      /* -> 192.168.1.7:80 */</code></pre>

          <p>El Pod de <code>192.168.1.4</code> desapareció. Su chain <code>KUBE-SEP-LJUUEGC24UMYBEWU</code> fue eliminada. El Deployment creó un Pod de reemplazo con IP <code>192.168.1.7</code> — una IP distinta, como siempre — y kube-proxy creó una nueva chain <code>KUBE-SEP-4AGQXI4GR55VNW45</code> para él. Las probabilidades se mantienen en 1/3, 1/2 y 1, distribuyendo el tráfico equitativamente entre los tres Pods activos. Todo esto sin reiniciar nada, sin intervención manual — es el loop de control funcionando.</p>
        `,
  en: `
          <p>When we ran <code>kubectl get ep nginx</code> in the previous part, the cluster emitted a warning:</p>

          <pre><code>kubectl get ep nginx
# Warning: v1 Endpoints is deprecated in v1.33+; use discovery.k8s.io/v1 EndpointSlice
# NAME    ENDPOINTS                                      AGE
# nginx   192.168.1.4:80,192.168.1.5:80,192.168.1.6:80  49s</code></pre>

          <p>The <code>Endpoints</code> object was the original way to track the Pods behind a Service. It still works, but it was replaced by <code>EndpointSlice</code>. To understand why, you need to understand the problem it solves.</p>

          <h2>The scaling problem with the Endpoints object</h2>

          <p>The original <code>Endpoints</code> object puts all endpoints of a Service into a single etcd object. With a Service that has 1000 replicas — common in large-scale applications — that object takes up tens of kilobytes. Every time a Pod is added, removed, or changes state, the API server writes the entire object again and distributes it to every node in the cluster. With thousands of nodes, that is an enormous amount of traffic for a single Pod change.</p>

          <p>EndpointSlice solves the scaling problem with a simple idea: instead of one giant object, multiple slices are created with a maximum of 100 endpoints each. When a Pod changes, only the slice containing it needs to be updated — and only that slice is distributed over the network. The rest remain unchanged.</p>

          <h2>Inspecting the EndpointSlices of a Service</h2>

          <p>Each EndpointSlice has a <code>kubernetes.io/service-name</code> label that links it to its Service. To view them:</p>

          <pre><code>kubectl get endpointslices
# NAME          ADDRESSTYPE   PORTS   ENDPOINTS                             AGE
# kubernetes    IPv4          6443    172.30.1.2                            9d
# nginx-bkx2b   IPv4          80      192.168.1.5,192.168.1.6,192.168.1.4   47m</code></pre>

          <p>With three replicas everything fits in a single slice. To see the full structure:</p>

          <pre><code>kubectl get endpointslice nginx-bkx2b -o yaml
# addressType: IPv4
# apiVersion: discovery.k8s.io/v1
# endpoints:
# - addresses:
#   - 192.168.1.5
#   conditions:
#     ready: true
#     serving: true
#     terminating: false
#   nodeName: node01
#   targetRef:
#     kind: Pod
#     name: nginx-66686b6766-cp47m
#     namespace: default
#     uid: 5e229a31-f253-46d2-90d0-ab9a1eee47e5
# - addresses:
#   - 192.168.1.6
#   conditions:
#     ready: true
#     serving: true
#     terminating: false
#   nodeName: node01
#   targetRef:
#     kind: Pod
#     name: nginx-66686b6766-tk7qv
#     namespace: default
#     uid: c2349683-3adf-48ce-a381-250088ffb13c
# - addresses:
#   - 192.168.1.4
#   conditions:
#     ready: true
#     serving: true
#     terminating: false
#   nodeName: node01
#   targetRef:
#     kind: Pod
#     name: nginx-66686b6766-74zs8
#     namespace: default
#     uid: 8affde90-1f17-4103-88db-23c085fc1761
# kind: EndpointSlice
# metadata:
#   annotations:
#     endpoints.kubernetes.io/last-change-trigger-time: "2026-04-10T21:04:52Z"
#   generateName: nginx-
#   generation: 1
#   labels:
#     app: nginx
#     endpointslice.kubernetes.io/managed-by: endpointslice-controller.k8s.io
#     kubernetes.io/service-name: nginx
#   name: nginx-bkx2b
#   namespace: default
#   ownerReferences:
#   - apiVersion: v1
#     blockOwnerDeletion: true
#     controller: true
#     kind: Service
#     name: nginx
#     uid: 909643ef-167b-4f65-9b23-e2c6f645c290
# ports:
# - name: ""
#   port: 80
#   protocol: TCP</code></pre>

          <p>The <code>ownerReferences</code> field establishes the ownership relationship: the Service owns the slice. If the Service is deleted, Kubernetes' garbage collector deletes the EndpointSlice automatically. The <code>generateName: nginx-</code> field explains why the slice name is <code>nginx-bkx2b</code> — it is a prefix with a random suffix generated by the API server.</p>

          <h2>The three conditions of an endpoint</h2>

          <p>Each endpoint within a slice has three independent boolean conditions. <code>ready</code> indicates whether the Pod passed its readiness probes and is ready to receive normal traffic. <code>serving</code> is similar to <code>ready</code> but remains <code>true</code> during the Pod's graceful shutdown — it allows existing connections to finish while the Pod is shutting down. <code>terminating</code> is set to <code>true</code> when the Pod has received a SIGTERM signal and is in the process of closing.</p>

          <p>kube-proxy only adds an endpoint to the iptables rules if <code>ready: true</code>. When a Pod starts terminating, <code>terminating</code> becomes <code>true</code> and <code>ready</code> becomes <code>false</code> — kube-proxy removes it from the <code>KUBE-SVC-*</code> chains immediately. The Pod can finish processing existing connections thanks to conntrack, which already has those connections recorded, but it will not receive new traffic.</p>

          <h2>nodeName and topology-aware routing</h2>

          <p>Each endpoint includes the <code>nodeName</code> field with the node where the Pod is running. Kubernetes uses this field — along with an additional field called <code>hints</code> — to implement <a href="https://kubernetes.io/docs/concepts/services-networking/topology-aware-routing/" target="_blank"><em>topology-aware routing</em></a>: preferring endpoints on the same node or availability zone as the client before crossing zones. This reduces latency and cross-zone traffic costs in multi-AZ clusters.</p>

          <p>To enable it, add the annotation <code>service.kubernetes.io/topology-mode: Auto</code> to the Service. The EndpointSlice controller then calculates which endpoints should be used in each zone and annotates them in the <code>hints.forZones</code> field of each endpoint in the slice:</p>

          <pre><code># With topology-mode: Auto, the slice includes per-zone hints
# endpoints:
# - addresses:
#   - 192.168.1.5
#   hints:
#     forZones:
#     - name: us-east-1a
#   nodeName: node01
#   zone: us-east-1a</code></pre>

          <p>kube-proxy reads those hints and filters endpoints when building the rules: a node in <code>us-east-1a</code> will only include in its <code>KUBE-SVC-*</code> the endpoints marked with <code>forZones: us-east-1a</code>. Traffic never leaves the zone unless no endpoints are available in it. The implementation lives in <a href="https://github.com/kubernetes/kubernetes/blob/master/pkg/proxy/topology.go" target="_blank"><code>pkg/proxy/topology.go</code></a>, function <code>CategorizeEndpoints()</code>.</p>

          <p>The feature was called <em>Topology Aware Hints</em> through Kubernetes 1.26 and was renamed to <em>Topology Aware Routing</em> in 1.27. The legacy annotation <code>service.kubernetes.io/topology-aware-hints</code> is still supported for backwards compatibility.</p>

          <h2>How kube-proxy consumes EndpointSlices</h2>

          <p>kube-proxy does not poll EndpointSlices — it watches them via an Informer, the same watch mechanism we saw in part 3. Every time an EndpointSlice changes — because a Pod was added, removed, or changed condition — kube-proxy receives the event and syncs the node's iptables rules. To verify it, we delete a Pod and immediately inspect the rules:</p>

          <pre><code>kubectl delete pod nginx-66686b6766-74zs8
# pod "nginx-66686b6766-74zs8" deleted

kubectl get pods -o wide
# NAME                     READY   IP            NODE
# nginx-66686b6766-cp47m   1/1     192.168.1.5   node01
# nginx-66686b6766-tfww9   1/1     192.168.1.7   node01   ← new Pod, new IP
# nginx-66686b6766-tk7qv   1/1     192.168.1.6   node01

sudo iptables -t nat -L KUBE-SVC-2CMXP7HKUVJN7L6M -n --line-numbers
# Chain KUBE-SVC-2CMXP7HKUVJN7L6M (1 references)
# num  target                       prot  opt  source           destination
# 1    KUBE-MARK-MASQ               6     --   !192.168.0.0/16  10.99.20.216   tcp dpt:80
# 2    KUBE-SEP-BD6TRYPAX6RNC2PD   0     --   0.0.0.0/0        0.0.0.0/0      /* -> 192.168.1.5:80 */ statistic mode random probability 0.33333333349
# 3    KUBE-SEP-XBSUSKRGZRORR4T6   0     --   0.0.0.0/0        0.0.0.0/0      /* -> 192.168.1.6:80 */ statistic mode random probability 0.50000000000
# 4    KUBE-SEP-4AGQXI4GR55VNW45   0     --   0.0.0.0/0        0.0.0.0/0      /* -> 192.168.1.7:80 */</code></pre>

          <p>The Pod at <code>192.168.1.4</code> is gone. Its <code>KUBE-SEP-LJUUEGC24UMYBEWU</code> chain was removed. The Deployment created a replacement Pod with IP <code>192.168.1.7</code> — a different IP, as always — and kube-proxy created a new <code>KUBE-SEP-4AGQXI4GR55VNW45</code> chain for it. The probabilities stay at 1/3, 1/2, and 1, distributing traffic evenly across the three active Pods. All of this without restarting anything, without manual intervention — the control loop working.</p>
        `,
};
