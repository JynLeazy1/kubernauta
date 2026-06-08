export default {
  es: `
      <p>Cerramos el capítulo que quizás cambia más la forma en que ves Kubernetes. El <a href="/course/kubernetes-for-beginners/architecture">capítulo 1</a> te dio la topografía: qué procesos corren dónde. Este capítulo te dio el <em>lenguaje</em> con el que todos esos procesos se entienden. Vamos a recapitular.</p>

      <h2>El contrato en una frase</h2>

      <p>Kubernetes es <strong>declarativo</strong>: tú describes el estado que quieres, el cluster se compromete a alcanzarlo y mantenerlo. De ese contrato se derivan idempotencia, convergencia y retries gratis — las tres propiedades que un sistema distribuido necesita para sobrevivirse a sí mismo.</p>

      <h2>Objetos, spec, status</h2>

      <p>Todo lo que existe en el cluster es un <strong>objeto</strong>: una instancia de un <em>recurso</em>. Cada objeto tiene <code>spec</code> (lo que tú declaras), <code>status</code> (lo que el cluster observa) y <code>metadata</code> (identidad y organización). Tú nunca escribes <code>status</code>; es territorio de los controllers.</p>

      <h2>API: grupos y versiones</h2>

      <p>Los recursos están organizados en <strong>grupos</strong> (<code>core</code>, <code>apps</code>, <code>batch</code>, <code>networking.k8s.io</code>, …) y tienen versiones (<em>alpha</em>, <em>beta</em>, <em>stable</em>). El <code>apiVersion</code> en un YAML es literalmente la dirección del tipo dentro de la API.</p>

      <p>Dos comandos para orientarte en tu cluster:</p>

      <pre><code>kubectl api-resources
kubectl explain &lt;tipo&gt;</code></pre>

      <h2>Controllers: el motor</h2>

      <p>Un <strong>controller</strong> es un loop que observa <code>spec</code>, observa el mundo real, y actúa para converger. Se implementa con un <em>informer</em> + <em>workqueue</em> sobre la API. Todos los componentes — desde el built-in ReplicaSet controller hasta un operator custom — siguen el mismo patrón. Y todos hablan con el apiserver, nunca con etcd directamente.</p>

      <h2>CRDs y Operators: la API no está cerrada</h2>

      <p>Un <code>CustomResourceDefinition</code> añade un tipo nuevo al cluster. Por sí solo solo guarda datos; combinado con un controller custom se convierte en un <strong>Operator</strong>. Así se construyen cert-manager, Argo CD, Prometheus Operator, Istio — y así construirías tú una automatización "the Kubernetes way".</p>

      <h2>Cliente: apply y sus variantes</h2>

      <p><code>kubectl apply</code> es la forma declarativa de hablarle al cluster. En producción, preferiblemente con <strong>server-side apply</strong>, que mueve el merge al apiserver y añade <em>field ownership</em> para que múltiples clientes no se pisen.</p>

      <p>Dos comandos que te ahorran sustos:</p>

      <pre><code>kubectl apply -f x.yaml --dry-run=server -o yaml
kubectl diff -f x.yaml</code></pre>

      <h2>El mapa mental completo</h2>

      <p>Si el <a href="/course/kubernetes-for-beginners/architecture">capítulo 1</a> te dio una ecuación como <em>"Kubernetes = apiserver + database + controllers + kubelets"</em>, el capítulo 2 la completa con el <em>cómo</em>:</p>

      <p><strong>El apiserver recibe declaraciones. Los controllers, cada uno con su informer, vigilan cambios y reconcilian. El estado vive en etcd pero se accede solo vía apiserver. El modelo es extensible vía CRDs y operators. El cliente (<code>kubectl</code>, Argo CD, Helm, lo que sea) es solo un HTTP client que habla ese contrato declarativo.</strong></p>

      <p>Esa oración es, en gran parte, el examen KCNA. Todo lo demás son instancias de estos principios aplicados a objetos específicos.</p>

      <h2>Claves KCNA de este capítulo</h2>

      <ul>
        <li>Declarativo = describes estado deseado; el sistema converge.</li>
        <li>Todo objeto tiene <code>spec</code> / <code>status</code> / <code>metadata</code>. Nunca escribes <code>status</code>.</li>
        <li>Grupos de API: <code>core</code> (solo <code>v1</code>) vs grupos con nombre (<code>apps/v1</code>, <code>batch/v1</code>, …). Versiones: alpha / beta / stable.</li>
        <li>Controllers = loops de reconciliación que hablan solo con el apiserver.</li>
        <li>CRDs extienden la API; CRD + controller = Operator.</li>
        <li><code>apply</code> es declarativo; <code>create</code> y <code>replace</code> son imperativos. Server-side apply resuelve conflictos entre múltiples clientes.</li>
      </ul>

      <h2>Qué viene</h2>

      <p>Con topografía (capítulo 1) y lenguaje (capítulo 2) dominados, estamos listos para abrir el primer objeto real: <strong>el Pod</strong>. En el <a href="/course/kubernetes-for-beginners/pods">capítulo 3</a> vemos qué hay dentro — pause container, namespaces compartidos, sidecars, init containers, probes, ciclo de vida — y por qué es la <em>unidad mínima</em> del cluster.</p>

      <p>A partir de ahí, cada capítulo abrirá un tipo de objeto (Deployment, Service, Namespace, …) usando el mismo método: qué declara, qué controller lo reconcilia, qué pasa en el kernel.</p>
    `,
  en: `
      <p>We're closing the chapter that probably changes how you see Kubernetes the most. <a href="/course/kubernetes-for-beginners/architecture">Chapter 1</a> gave you the topography: which processes run where. This chapter gave you the <em>language</em> those processes use to understand each other. Let's recap.</p>

      <h2>The contract in one sentence</h2>

      <p>Kubernetes is <strong>declarative</strong>: you describe the state you want, the cluster commits to reaching and maintaining it. From that contract come idempotency, convergence, and free retries — the three properties a distributed system needs to survive itself.</p>

      <h2>Objects, spec, status</h2>

      <p>Everything in the cluster is an <strong>object</strong>: an instance of a <em>resource</em>. Every object has <code>spec</code> (what you declare), <code>status</code> (what the cluster observes), and <code>metadata</code> (identity and organization). You never write <code>status</code>; it's the controllers' territory.</p>

      <h2>API: groups and versions</h2>

      <p>Resources are organized in <strong>groups</strong> (<code>core</code>, <code>apps</code>, <code>batch</code>, <code>networking.k8s.io</code>, …) and have versions (<em>alpha</em>, <em>beta</em>, <em>stable</em>). The <code>apiVersion</code> in a YAML is literally the type's address within the API.</p>

      <p>Two commands to orient yourself in your cluster:</p>

      <pre><code>kubectl api-resources
kubectl explain &lt;type&gt;</code></pre>

      <h2>Controllers: the engine</h2>

      <p>A <strong>controller</strong> is a loop that observes <code>spec</code>, observes the real world, and acts to converge. It's implemented with an <em>informer</em> + <em>workqueue</em> over the API. Every component — from the built-in ReplicaSet controller to a custom operator — follows the same pattern. And they all talk to the apiserver, never to etcd directly.</p>

      <h2>CRDs and Operators: the API is not closed</h2>

      <p>A <code>CustomResourceDefinition</code> adds a new type to the cluster. On its own it only stores data; combined with a custom controller it becomes an <strong>Operator</strong>. That's how cert-manager, Argo CD, Prometheus Operator, and Istio are built — and how you would build automation "the Kubernetes way".</p>

      <h2>Client: apply and its variants</h2>

      <p><code>kubectl apply</code> is the declarative way to talk to the cluster. In production, preferably with <strong>server-side apply</strong>, which moves the merge to the apiserver and adds <em>field ownership</em> so multiple clients don't stomp each other.</p>

      <p>Two commands that save you from trouble:</p>

      <pre><code>kubectl apply -f x.yaml --dry-run=server -o yaml
kubectl diff -f x.yaml</code></pre>

      <h2>The full mental map</h2>

      <p>If <a href="/course/kubernetes-for-beginners/architecture">chapter 1</a> gave you an equation like <em>"Kubernetes = apiserver + database + controllers + kubelets"</em>, chapter 2 completes it with the <em>how</em>:</p>

      <p><strong>The apiserver receives declarations. Controllers, each with its informer, watch changes and reconcile. State lives in etcd but is accessed only through the apiserver. The model is extensible via CRDs and operators. The client (<code>kubectl</code>, Argo CD, Helm, whatever) is just an HTTP client speaking that declarative contract.</strong></p>

      <p>That sentence is, in large part, the KCNA exam. Everything else is instances of these principles applied to specific objects.</p>

      <h2>KCNA keys from this chapter</h2>

      <ul>
        <li>Declarative = you describe desired state; the system converges.</li>
        <li>Every object has <code>spec</code> / <code>status</code> / <code>metadata</code>. You never write <code>status</code>.</li>
        <li>API groups: <code>core</code> (just <code>v1</code>) vs named groups (<code>apps/v1</code>, <code>batch/v1</code>, …). Versions: alpha / beta / stable.</li>
        <li>Controllers = reconciliation loops that talk only to the apiserver.</li>
        <li>CRDs extend the API; CRD + controller = Operator.</li>
        <li><code>apply</code> is declarative; <code>create</code> and <code>replace</code> are imperative. Server-side apply resolves conflicts between multiple clients.</li>
      </ul>

      <h2>What's next</h2>

      <p>With topography (chapter 1) and language (chapter 2) in hand, we're ready to open the first real object: <strong>the Pod</strong>. In <a href="/course/kubernetes-for-beginners/pods">chapter 3</a> we see what's inside — the pause container, shared namespaces, sidecars, init containers, probes, lifecycle — and why it's the cluster's <em>minimum unit</em>.</p>

      <p>From there on, every chapter will open one type of object (Deployment, Service, Namespace, …) using the same method: what it declares, which controller reconciles it, and what happens in the kernel.</p>
    `,
}
