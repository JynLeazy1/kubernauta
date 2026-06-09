export default {
  es: `
      <p>Tenemos todas las piezas sobre la mesa: cuatro procesos del control plane, tres en cada worker node, y una base de datos. Ahora vamos a ponerlos a trabajar juntos. La mejor manera de ver cómo encajan es seguir, paso por paso, lo que pasa entre que tecleas <code>kubectl apply -f deploy.yaml</code> y tu contenedor aparece corriendo.</p>

      <p>No es un proceso secuencial donde un proceso le dice al siguiente <em>"ya terminé, te toca"</em>. Es <strong>asíncrono y orientado a eventos</strong>: cada componente vigila el apiserver, reacciona a cambios, y actúa. Nadie espera a nadie. Esa es la clave para entender por qué Kubernetes escala.</p>

      <h2>Paso 1 — kubectl manda el YAML</h2>

      <p>Cuando haces <code>kubectl apply -f deploy.yaml</code>, <code>kubectl</code>:</p>

      <ol>
        <li>Lee el archivo y lo convierte a JSON.</li>
        <li>Toma tu <code>kubeconfig</code> para saber qué cluster apuntar y con qué credenciales.</li>
        <li>Abre una conexión TLS al <code>kube-apiserver</code> (puerto 6443) y hace un <code>POST</code> o <code>PATCH</code> con el objeto.</li>
      </ol>

      <p>Hasta aquí, <code>kubectl</code> no tiene ninguna magia: es un cliente HTTP con un parser de YAML.</p>

      <h2>Paso 2 — el apiserver filtra la petición</h2>

      <p>El apiserver recibe la petición y la pasa por una cadena:</p>

      <ul>
        <li><strong>Autenticación</strong>: ¿quién eres? (token, certificado, OIDC)</li>
        <li><strong>Autorización</strong>: ¿puedes hacer esto? (RBAC, ABAC, webhook)</li>
        <li><strong>Admission controllers</strong>: hooks que pueden modificar el objeto (mutating) o rechazarlo (validating).</li>
        <li><strong>Validación de schema</strong>: el objeto cumple con la OpenAPI spec del recurso.</li>
      </ul>

      <p>Si todo pasa, el apiserver <strong>escribe el objeto en etcd</strong>. En ese momento — y solo en ese momento — el Deployment existe oficialmente en el cluster. El apiserver responde <code>201 Created</code> a <code>kubectl</code>, y tu terminal muestra <code>deployment.apps/my-app created</code>.</p>

      <p>Ojo: <strong>todavía no hay Pods</strong>. Solo hay un objeto Deployment guardado.</p>

      <h2>Paso 3 — los controllers reaccionan</h2>

      <p>El <code>kube-controller-manager</code> tiene un <em>watch</em> abierto al apiserver sobre Deployments. Cuando ve el nuevo objeto, el <strong>Deployment controller</strong> se activa:</p>

      <ol>
        <li>Calcula: <em>"para este Deployment con 3 réplicas, necesito un ReplicaSet con replicas=3"</em>.</li>
        <li>Le pide al apiserver que cree ese ReplicaSet.</li>
      </ol>

      <p>El apiserver guarda el ReplicaSet en etcd. Eso dispara otro watch: el <strong>ReplicaSet controller</strong> ve que hay un RS con <code>replicas=3</code> y cero Pods. Crea 3 Pods (también vía apiserver). Cada Pod queda guardado en etcd con <code>spec.nodeName</code> vacío.</p>

      <h2>Paso 4 — el scheduler asigna nodos</h2>

      <p>El <code>kube-scheduler</code> vigila Pods sin <code>nodeName</code>. Los ve aparecer, y por cada uno corre el algoritmo que describimos en la <a href="/course/kubernetes-for-beginners/architecture/control-plane">sub-parte anterior</a>: <em>filtering</em> (qué nodos son elegibles) y <em>scoring</em> (cuál es el mejor).</p>

      <p>Para cada Pod, le pide al apiserver que actualice <code>spec.nodeName</code> con el nodo elegido. Ese <code>PATCH</code> queda en etcd.</p>

      <p>Hasta aquí, <strong>seguimos sin tener ningún contenedor corriendo</strong>. Todo ha pasado en el plano de datos, no en el de ejecución.</p>

      <h2>Paso 5 — kubelet levanta el Pod</h2>

      <p>En cada nodo, el <code>kubelet</code> tiene un watch al apiserver filtrado por <code>spec.nodeName</code>. Cuando el del nodo X ve que hay un Pod nuevo asignado a él:</p>

      <ol>
        <li>Le pide al <strong>container runtime</strong> (containerd, CRI-O) que cree el Pod vía CRI.</li>
        <li>El runtime <strong>descarga la imagen</strong> si no está en caché.</li>
        <li>El runtime crea primero el <code>pause</code> container, que mantiene vivos los namespaces de red y PID del Pod.</li>
        <li>Luego crea cada contenedor de tu app dentro de esos mismos namespaces.</li>
        <li>Una vez corriendo, <code>kubelet</code> empieza a ejecutar los <em>probes</em> y a reportar estado al apiserver.</li>
      </ol>

      <p>Si te interesa lo que pasa dentro del runtime y del kernel, el <a href="/tutorial/que-es-un-pod">tutorial "¿Qué es un Pod?"</a> abre esa caja.</p>

      <h2>Paso 6 — kube-proxy expone el Service</h2>

      <p>Si tu Deployment tenía una Service asociada, el flujo es paralelo: el apiserver guarda la Service, el <em>EndpointSlice controller</em> mapea los Pods que coinciden con el selector a IPs reales, y <code>kube-proxy</code> en cada nodo programa las reglas (iptables, ipvs, nftables) para que los paquetes dirigidos a la ClusterIP aterricen en las IPs de los Pods.</p>

      <p>A partir de ese momento, cualquier Pod del cluster puede hacer <code>curl http://my-service</code> y llegar a tus contenedores.</p>

      <h2>El patrón que se repite</h2>

      <p>Si te fijas, todo el flujo se puede resumir en una regla:</p>

      <p><strong>Alguien escribe en etcd → alguien más, que estaba mirando, reacciona → escribe algo nuevo en etcd → el siguiente reacciona → …</strong></p>

      <p>Nadie le habla directamente a nadie. Solo el apiserver tiene "voz"; el resto son observadores que actúan en cadena. Por eso puedes tener cientos de controllers, miles de nodos, y el modelo sigue funcionando: cada componente es independiente y reactivo.</p>

      <p>En la siguiente sub-parte abrimos etcd, la pieza que hace todo esto posible — la única fuente de verdad del cluster.</p>
    `,
  en: `
      <p>All the pieces are on the table: four control plane processes, three on each worker node, and a database. Now let's put them to work together. The best way to see how they fit is to follow, step by step, what happens between typing <code>kubectl apply -f deploy.yaml</code> and your container showing up running.</p>

      <p>It is not a sequential process where one component tells the next <em>"I'm done, your turn"</em>. It is <strong>asynchronous and event-driven</strong>: every component watches the apiserver, reacts to changes, and acts. Nobody waits for anybody. That's the key to why Kubernetes scales.</p>

      <h2>Step 1 — kubectl sends the YAML</h2>

      <p>When you run <code>kubectl apply -f deploy.yaml</code>, <code>kubectl</code>:</p>

      <ol>
        <li>Reads the file and converts it to JSON.</li>
        <li>Uses your <code>kubeconfig</code> to know which cluster to hit and with what credentials.</li>
        <li>Opens a TLS connection to the <code>kube-apiserver</code> (port 6443) and sends a <code>POST</code> or <code>PATCH</code> with the object.</li>
      </ol>

      <p>Up to this point, <code>kubectl</code> has no magic: it's an HTTP client with a YAML parser.</p>

      <h2>Step 2 — the apiserver filters the request</h2>

      <p>The apiserver receives the request and runs it through a chain:</p>

      <ul>
        <li><strong>Authentication</strong>: who are you? (token, certificate, OIDC)</li>
        <li><strong>Authorization</strong>: can you do this? (RBAC, ABAC, webhook)</li>
        <li><strong>Admission controllers</strong>: hooks that can mutate the object (mutating) or reject it (validating).</li>
        <li><strong>Schema validation</strong>: the object matches the resource's OpenAPI spec.</li>
      </ul>

      <p>If everything passes, the apiserver <strong>writes the object to etcd</strong>. At that moment — and only at that moment — the Deployment officially exists in the cluster. The apiserver answers <code>201 Created</code> to <code>kubectl</code>, and your terminal prints <code>deployment.apps/my-app created</code>.</p>

      <p>Notice: <strong>there are no Pods yet</strong>. Only a stored Deployment object.</p>

      <h2>Step 3 — the controllers react</h2>

      <p>The <code>kube-controller-manager</code> has an open <em>watch</em> on the apiserver over Deployments. When it sees the new object, the <strong>Deployment controller</strong> kicks in:</p>

      <ol>
        <li>Computes: <em>"for this Deployment with 3 replicas, I need a ReplicaSet with replicas=3"</em>.</li>
        <li>Asks the apiserver to create that ReplicaSet.</li>
      </ol>

      <p>The apiserver stores the ReplicaSet in etcd. That fires another watch: the <strong>ReplicaSet controller</strong> sees an RS with <code>replicas=3</code> and zero Pods. It creates 3 Pods (also via the apiserver). Each Pod ends up in etcd with an empty <code>spec.nodeName</code>.</p>

      <h2>Step 4 — the scheduler assigns nodes</h2>

      <p>The <code>kube-scheduler</code> watches Pods without <code>nodeName</code>. It sees them appear, and for each one runs the algorithm we described in the <a href="/course/kubernetes-for-beginners/architecture/control-plane">previous sub-part</a>: <em>filtering</em> (which nodes are eligible) and <em>scoring</em> (which one is best).</p>

      <p>For each Pod, it asks the apiserver to patch <code>spec.nodeName</code> with the chosen node. That <code>PATCH</code> lands in etcd.</p>

      <p>Up to here, <strong>we still have no container running</strong>. Everything has happened in the data plane, not in the execution plane.</p>

      <h2>Step 5 — kubelet brings up the Pod</h2>

      <p>On every node, <code>kubelet</code> has a watch on the apiserver filtered by <code>spec.nodeName</code>. When the one on node X sees a new Pod assigned to it:</p>

      <ol>
        <li>It asks the <strong>container runtime</strong> (containerd, CRI-O) to create the Pod via CRI.</li>
        <li>The runtime <strong>pulls the image</strong> if it's not cached.</li>
        <li>The runtime first creates the <code>pause</code> container, which holds the Pod's network and PID namespaces alive.</li>
        <li>Then it creates each of your app's containers inside those same namespaces.</li>
        <li>Once running, <code>kubelet</code> starts executing <em>probes</em> and reporting status back to the apiserver.</li>
      </ol>

      <p>If you're curious about what happens inside the runtime and the kernel, the <a href="/tutorial/que-es-un-pod">"What is a Pod?" tutorial</a> opens that box.</p>

      <h2>Step 6 — kube-proxy exposes the Service</h2>

      <p>If your Deployment had an associated Service, the flow is parallel: the apiserver stores the Service, the <em>EndpointSlice controller</em> maps the Pods matching the selector to real IPs, and <code>kube-proxy</code> on every node programs the rules (iptables, ipvs, nftables) so that packets directed to the ClusterIP land on Pod IPs.</p>

      <p>From that moment on, any Pod in the cluster can run <code>curl http://my-service</code> and reach your containers.</p>

      <h2>The recurring pattern</h2>

      <p>If you look closely, the whole flow boils down to a single rule:</p>

      <p><strong>Somebody writes to etcd → somebody else, who was watching, reacts → writes something new to etcd → the next one reacts → …</strong></p>

      <p>Nobody talks to anybody directly. Only the apiserver has a "voice"; the rest are observers acting in a chain. That's why you can have hundreds of controllers, thousands of nodes, and the model still works: each component is independent and reactive.</p>

      <p>In the next sub-part we open etcd, the piece that makes all this possible — the only source of truth of the cluster.</p>
    `,
}
