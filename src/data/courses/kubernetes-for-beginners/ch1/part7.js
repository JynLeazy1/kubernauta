export default {
  es: `
      <p>Cerramos el capítulo. Si hiciste el recorrido completo, ahora tienes una imagen que no es un diagrama genérico de internet — es un modelo mental de procesos, conexiones y loops. Vamos a recapitular.</p>

      <h2>El cluster, visto en una sola página</h2>

      <p>Un cluster de Kubernetes son <strong>máquinas Linux corriendo procesos específicos</strong>. Nada más, nada menos.</p>

      <p>En el <strong><code>control plane</code></strong> corren cuatro procesos:</p>

      <ul>
        <li><code>kube-apiserver</code> — la única puerta. Autentica, autoriza, valida, persiste en etcd.</li>
        <li><code>etcd</code> — la memoria. Key-value store distribuido con Raft.</li>
        <li><code>kube-scheduler</code> — el asignador. Decide en qué nodo corre cada Pod.</li>
        <li><code>kube-controller-manager</code> — los loops de reconciliación (Deployment, ReplicaSet, Node, Job, …).</li>
      </ul>

      <p>Cuando el cluster vive en una nube, se suma el <code>cloud-controller-manager</code>, que habla con la API del proveedor.</p>

      <p>En cada <strong><code>worker node</code></strong> corren tres:</p>

      <ul>
        <li><code>kubelet</code> — el agente local. Reconcilia los Pods asignados a su nodo.</li>
        <li>Un <em>container runtime</em> (containerd, CRI-O) — crea los contenedores vía CRI.</li>
        <li><code>kube-proxy</code> — programa las reglas de red para que las Services funcionen.</li>
      </ul>

      <h2>La regla que lo ata todo</h2>

      <p>Solo el <code>kube-apiserver</code> habla con etcd. Todos los demás componentes son <strong>clientes del apiserver</strong>. Se suscriben a cambios (watch) y reaccionan. Nadie le habla directamente a nadie: la coordinación pasa por etcd, expuesta a través del apiserver.</p>

      <p>Esa regla es la que permite que el sistema escale, que sea asíncrono, que sobreviva a fallos. Tenla presente en cada capítulo que viene: cada vez que veas un nuevo tipo de objeto (StatefulSet, Ingress, Job, …) el patrón es el mismo. Alguien declara, un controller reconcilia, el apiserver arbitra.</p>

      <h2>El flujo, comprimido</h2>

      <p>Un <code>kubectl apply</code> dispara esta cadena:</p>

      <ol>
        <li>apiserver valida y escribe a etcd.</li>
        <li>Controllers ven el cambio y crean objetos derivados (ReplicaSet, Pods).</li>
        <li>Scheduler asigna <code>nodeName</code> a cada Pod.</li>
        <li>kubelet del nodo elegido pide al runtime que cree los contenedores.</li>
        <li>Runtime levanta pause + containers con namespaces y cgroups.</li>
        <li>kube-proxy programa las reglas de red si hay Services.</li>
      </ol>

      <p>En cada paso, lo único que pasa es: leer estado, compararlo con el deseado, escribir la diferencia. Un loop de reconciliación, repetido en distintas capas.</p>

      <h2>Alta disponibilidad, en una frase</h2>

      <p>En producción nunca corres un control plane de una sola máquina. 3 o 5 nodos, apiserver stateless detrás de un LB, etcd con quórum, scheduler y controller-manager con leader election. Los workers sobreviven a caídas del control plane.</p>

      <h2>Qué viene</h2>

      <p>Este capítulo fue la <em>topografía</em> del cluster: qué corre dónde y por qué. El <a href="/course/kubernetes-for-beginners/api-and-declarative-model">capítulo 2</a> baja una capa: cómo funciona la API de Kubernetes y qué significa exactamente el modelo declarativo del que tanto hemos hablado. De ahí en adelante, cada capítulo abre uno de los objetos (Pods, Deployments, Services, …) con la misma lente: <em>qué declara, qué controller reconcilia, qué pasa en el kernel</em>.</p>

      <h2>Para la KCNA</h2>

      <p>Si tuvieras que llevarte una sola cosa al examen, que sea esto:</p>

      <p><strong>Kubernetes no es magia. Es un apiserver delante de una base de datos, con un ejército de controllers reaccionando a cambios, y un kubelet por nodo que traduce objetos a procesos Linux.</strong></p>

      <p>Todo lo demás son detalles de implementación.</p>
    `,
  en: `
      <p>Wrapping up the chapter. If you went through the whole thing, you now have a picture that isn't a generic internet diagram — it's a mental model of processes, connections, and loops. Let's recap.</p>

      <h2>The cluster, in one page</h2>

      <p>A Kubernetes cluster is <strong>Linux machines running specific processes</strong>. Nothing more, nothing less.</p>

      <p>On the <strong><code>control plane</code></strong>, four processes run:</p>

      <ul>
        <li><code>kube-apiserver</code> — the single door. Authenticates, authorizes, validates, persists to etcd.</li>
        <li><code>etcd</code> — the memory. Distributed key-value store with Raft.</li>
        <li><code>kube-scheduler</code> — the assigner. Decides which node each Pod runs on.</li>
        <li><code>kube-controller-manager</code> — the reconciliation loops (Deployment, ReplicaSet, Node, Job, …).</li>
      </ul>

      <p>When the cluster lives on a cloud, the <code>cloud-controller-manager</code> is added, talking to the provider's API.</p>

      <p>On every <strong><code>worker node</code></strong>, three processes run:</p>

      <ul>
        <li><code>kubelet</code> — the local agent. Reconciles Pods assigned to its node.</li>
        <li>A <em>container runtime</em> (containerd, CRI-O) — creates containers via CRI.</li>
        <li><code>kube-proxy</code> — programs network rules so Services work.</li>
      </ul>

      <h2>The rule that ties it all together</h2>

      <p>Only the <code>kube-apiserver</code> talks to etcd. Every other component is an <strong>apiserver client</strong>. They subscribe to changes (watch) and react. Nobody talks to anybody directly: coordination flows through etcd, exposed via the apiserver.</p>

      <p>That rule is what lets the system scale, stay asynchronous, and survive failures. Keep it in mind through every chapter ahead: every time you see a new kind of object (StatefulSet, Ingress, Job, …) the pattern is the same. Somebody declares, a controller reconciles, the apiserver arbitrates.</p>

      <h2>The flow, compressed</h2>

      <p>A <code>kubectl apply</code> triggers this chain:</p>

      <ol>
        <li>apiserver validates and writes to etcd.</li>
        <li>Controllers see the change and create derived objects (ReplicaSet, Pods).</li>
        <li>Scheduler sets <code>nodeName</code> on each Pod.</li>
        <li>kubelet on the chosen node asks the runtime to create the containers.</li>
        <li>Runtime brings up pause + containers with namespaces and cgroups.</li>
        <li>kube-proxy programs network rules if Services exist.</li>
      </ol>

      <p>At every step, all that happens is: read state, compare to desired, write the diff. A reconciliation loop, repeated at different layers.</p>

      <h2>High availability, in one sentence</h2>

      <p>In production you never run a single-machine control plane. 3 or 5 nodes, a stateless apiserver behind an LB, etcd with quorum, scheduler and controller-manager with leader election. Workers survive control plane outages.</p>

      <h2>What's next</h2>

      <p>This chapter was the <em>topography</em> of the cluster: what runs where and why. <a href="/course/kubernetes-for-beginners/api-and-declarative-model">Chapter 2</a> goes one layer deeper: how the Kubernetes API actually works and what the declarative model we've been talking about really means. From there on, every chapter opens one of the objects (Pods, Deployments, Services, …) through the same lens: <em>what it declares, what controller reconciles it, what happens in the kernel</em>.</p>

      <h2>For the KCNA</h2>

      <p>If you had to take one thing from this chapter to the exam, let it be this:</p>

      <p><strong>Kubernetes is not magic. It's an apiserver in front of a database, with an army of controllers reacting to changes, and one kubelet per node translating objects into Linux processes.</strong></p>

      <p>Everything else is implementation detail.</p>
    `,
}
