export default {
  es: `
      <p>Llevamos todo el curso hablando de <em>controllers</em>. Ya los vimos en el <a href="/course/kubernetes-for-beginners/architecture/control-plane">plano de control</a>, aparecieron en el <a href="/course/kubernetes-for-beginners/architecture/flujo-de-una-peticion">flujo de una petición</a>, y los mencionamos en la <a href="/course/kubernetes-for-beginners/api-and-declarative-model/objetos-y-reconciliacion">sub-parte anterior</a> al describir el loop. Toca formalizarlos: qué son, cómo se construyen y por qué el modelo entero depende de ellos.</p>

      <h2>Qué es un controller</h2>

      <p>Un <strong>controller</strong> es un proceso (o una pieza dentro de un proceso más grande) que implementa el <strong>patrón de control</strong>: vigila continuamente el estado de ciertos objetos y actúa cuando el estado observado difiere del deseado.</p>

      <p>No son una abstracción exótica. La <a href="https://kubernetes.io/docs/concepts/architecture/controller/" target="_blank" rel="noopener noreferrer">documentación oficial</a> los define literalmente como <em>"control loops that watch the state of your cluster, then make or request changes where needed"</em>. Thermostato y caldera: el controller observa, compara y actúa.</p>

      <h2>El patrón, visto con código</h2>

      <p>Cualquier controller — el <code>ReplicaSet</code> controller, un operador custom tuyo, un controller de un tercero — encaja en esta forma:</p>

      <pre><code>for {
    evento := esperarCambioEnApiServer()
    objeto := obtenerEstadoDeseado(evento)
    real := observarMundoReal(objeto)
    if real != deseado(objeto) {
        ejecutarAccionPara(objeto)
    }
    reportarStatus(objeto)
}</code></pre>

      <p class="source-note">Pseudocódigo ilustrativo. Para el patrón real en client-go (informers + workqueues) se recomienda leer <a href="https://github.com/kubernetes/sample-controller" target="_blank" rel="noopener noreferrer">sample-controller</a> del proyecto Kubernetes.</p>

      <p>La "acción" depende del tipo de controller:</p>

      <ul>
        <li>El <em>ReplicaSet controller</em>: si hay menos Pods de los declarados, crea más. Si hay más, elimina algunos.</li>
        <li>El <em>Deployment controller</em>: gestiona un ReplicaSet y sus versiones anteriores para implementar rolling updates.</li>
        <li>El <em>Node controller</em>: marca nodos como <em>NotReady</em> si no dan señales, y eventualmente evicta sus Pods.</li>
        <li>El <em>Service controller</em>: en clusters cloud, solicita un LoadBalancer al proveedor cuando alguien crea un Service tipo LoadBalancer.</li>
      </ul>

      <p>Cada uno es independiente, cada uno vigila sus propios recursos, y todos coexisten sin saber de los demás.</p>

      <h2>Informers: cómo un controller "vigila"</h2>

      <p>En la implementación real (tanto en los controllers del kube-controller-manager como en operators hechos con <code>client-go</code> o frameworks como Kubebuilder), la vigilancia se hace con una pieza llamada <strong>informer</strong>.</p>

      <p>Un informer:</p>

      <ol>
        <li>Hace un <code>LIST</code> inicial al apiserver para cargar el estado actual de todos los objetos del tipo que le interesa.</li>
        <li>Abre un <code>WATCH</code> persistente para recibir cada cambio (<code>ADDED</code>, <code>MODIFIED</code>, <code>DELETED</code>) desde ese punto en adelante.</li>
        <li>Mantiene una caché local con todos esos objetos.</li>
        <li>Cuando llega un cambio, empuja el nombre del objeto a una <em>workqueue</em>.</li>
        <li>Uno o varios <em>workers</em> toman items de la cola y ejecutan el reconcile.</li>
      </ol>

      <p>La caché local es importante: cuando el reconcile necesita consultar estado, lee de la caché — no del apiserver. Eso reduce drásticamente la carga sobre el apiserver y hace posible tener cientos de controllers simultáneos.</p>

      <div class="callout callout-note">
        <span class="callout-label">Profundizar</span>
        <p>Informers, workqueues, DeltaFIFO y el resto del machinery de <code>client-go</code> merecen su propio post. Queda en el <em>backlog</em> como <em>"Informers y workqueues en client-go"</em>.</p>
      </div>

      <h2>Single source of truth: el apiserver</h2>

      <p>Una propiedad fundamental del modelo: los controllers <strong>nunca leen ni escriben etcd directamente</strong>. Todo pasa por el apiserver.</p>

      <p>Esto tiene varias consecuencias que conviene entender:</p>

      <ul>
        <li><strong>Auditoría centralizada</strong>: si quieres saber quién cambió qué, los audit logs del apiserver tienen todo.</li>
        <li><strong>Admission uniformemente aplicado</strong>: las validaciones y mutating webhooks se ejecutan para cualquiera — humanos, controllers, herramientas — que escriba vía la API.</li>
        <li><strong>Aislamiento de etcd</strong>: si mañana cambias etcd por otra base de datos, los controllers no se enteran.</li>
        <li><strong>Resiliencia</strong>: si el apiserver se cae, los controllers pausan, no corrompen nada. Cuando vuelve, reconcilian y todo continúa.</li>
      </ul>

      <h2>Controllers y extensibilidad</h2>

      <p>Los controllers built-in cubren los tipos estándar (Deployments, Jobs, Services, …). Pero el modelo es abierto: puedes escribir tu propio controller para reconciliar tipos propios (<a href="/course/kubernetes-for-beginners/api-and-declarative-model/crds-y-extensibilidad">CRDs</a>, que vemos en la siguiente sub-parte) o incluso para aumentar el comportamiento sobre tipos existentes.</p>

      <p>Ese patrón — un CRD que describe una cosa + un controller que la reconcilia — es lo que se conoce como <strong>Operator pattern</strong>. No es "una feature" de Kubernetes; es la aplicación natural del patrón de control a un dominio específico. Hay operators para casi todo: PostgreSQL, Kafka, Prometheus, cert-manager, Argo CD.</p>

      <h2>Qué necesitas recordar para la KCNA</h2>

      <ul>
        <li>Un controller es un loop que observa estado deseado vs real, y actúa para converger.</li>
        <li>Los controllers se comunican con el apiserver, nunca con etcd directamente.</li>
        <li>Los controllers son <em>independientes</em>: cada uno vigila sus recursos, y el sistema emerge de su colaboración.</li>
        <li>El <em>Operator pattern</em> = CRD + controller custom. Es la extensión natural del modelo.</li>
      </ul>

      <p>Con esto ya entiendes cómo funciona el 100% del modelo declarativo. En la sub-parte siguiente abrimos la pieza que hace que la API no esté cerrada: los CRDs.</p>
    `,
  en: `
      <p>We've been talking about <em>controllers</em> the entire course. We saw them in the <a href="/course/kubernetes-for-beginners/architecture/control-plane">control plane</a>, they appeared in the <a href="/course/kubernetes-for-beginners/architecture/flujo-de-una-peticion">request flow</a>, and we mentioned them in the <a href="/course/kubernetes-for-beginners/api-and-declarative-model/objetos-y-reconciliacion">previous sub-part</a> when describing the loop. Time to formalize them: what they are, how they're built, and why the whole model depends on them.</p>

      <h2>What a controller is</h2>

      <p>A <strong>controller</strong> is a process (or a piece inside a larger process) that implements the <strong>control pattern</strong>: it continuously watches the state of certain objects and acts when observed state differs from desired state.</p>

      <p>Not an exotic abstraction. The <a href="https://kubernetes.io/docs/concepts/architecture/controller/" target="_blank" rel="noopener noreferrer">official docs</a> literally define them as <em>"control loops that watch the state of your cluster, then make or request changes where needed"</em>. Thermostat and boiler: the controller observes, compares, and acts.</p>

      <h2>The pattern, with code</h2>

      <p>Any controller — the <code>ReplicaSet</code> controller, a custom operator of yours, a third-party one — fits this shape:</p>

      <pre><code>for {
    event := waitForChangeInApiServer()
    object := fetchDesiredState(event)
    real := observeRealWorld(object)
    if real != desired(object) {
        executeActionFor(object)
    }
    reportStatus(object)
}</code></pre>

      <p class="source-note">Illustrative pseudocode. For the real pattern in client-go (informers + workqueues), read the Kubernetes project's <a href="https://github.com/kubernetes/sample-controller" target="_blank" rel="noopener noreferrer">sample-controller</a>.</p>

      <p>The "action" depends on the controller type:</p>

      <ul>
        <li><em>ReplicaSet controller</em>: if there are fewer Pods than declared, create more. If more, delete some.</li>
        <li><em>Deployment controller</em>: manages a ReplicaSet and its previous revisions to implement rolling updates.</li>
        <li><em>Node controller</em>: marks nodes as <em>NotReady</em> if they stop reporting, and eventually evicts their Pods.</li>
        <li><em>Service controller</em>: on cloud clusters, requests a LoadBalancer from the provider when someone creates a Service of type LoadBalancer.</li>
      </ul>

      <p>Each is independent, each watches its own resources, and they all coexist without knowing about each other.</p>

      <h2>Informers: how a controller "watches"</h2>

      <p>In real implementations (both in kube-controller-manager's controllers and in operators built with <code>client-go</code> or frameworks like Kubebuilder), the watching is done by a piece called an <strong>informer</strong>.</p>

      <p>An informer:</p>

      <ol>
        <li>Does an initial <code>LIST</code> against the apiserver to load current state of all objects of the type it cares about.</li>
        <li>Opens a persistent <code>WATCH</code> to receive every change (<code>ADDED</code>, <code>MODIFIED</code>, <code>DELETED</code>) from that point on.</li>
        <li>Maintains a local cache with all those objects.</li>
        <li>When a change arrives, it pushes the object's name onto a <em>workqueue</em>.</li>
        <li>One or several <em>workers</em> pull items from the queue and run the reconcile.</li>
      </ol>

      <p>The local cache matters: when the reconcile needs to query state, it reads from the cache — not from the apiserver. That drastically reduces apiserver load and makes it possible to run hundreds of controllers simultaneously.</p>

      <div class="callout callout-note">
        <span class="callout-label">Deep dive</span>
        <p>Informers, workqueues, DeltaFIFO, and the rest of the <code>client-go</code> machinery deserve their own post. They're on the <em>backlog</em> as <em>"Informers and workqueues in client-go"</em>.</p>
      </div>

      <h2>Single source of truth: the apiserver</h2>

      <p>A fundamental property of the model: controllers <strong>never read or write etcd directly</strong>. Everything goes through the apiserver.</p>

      <p>This has several consequences worth understanding:</p>

      <ul>
        <li><strong>Centralized audit</strong>: if you want to know who changed what, apiserver audit logs have it all.</li>
        <li><strong>Admission uniformly applied</strong>: validations and mutating webhooks run for anyone — humans, controllers, tools — writing through the API.</li>
        <li><strong>etcd isolation</strong>: if you swap etcd for another database tomorrow, controllers don't notice.</li>
        <li><strong>Resilience</strong>: if the apiserver goes down, controllers pause — they don't corrupt anything. When it comes back, they reconcile and everything proceeds.</li>
      </ul>

      <h2>Controllers and extensibility</h2>

      <p>Built-in controllers cover the standard types (Deployments, Jobs, Services, …). But the model is open: you can write your own controller to reconcile your own types (<a href="/course/kubernetes-for-beginners/api-and-declarative-model/crds-y-extensibilidad">CRDs</a>, covered in the next sub-part) or even to augment behavior on existing types.</p>

      <p>That pattern — a CRD describing a thing + a controller that reconciles it — is what's known as the <strong>Operator pattern</strong>. It's not "a feature" of Kubernetes; it's the natural application of the control pattern to a specific domain. There are operators for almost anything: PostgreSQL, Kafka, Prometheus, cert-manager, Argo CD.</p>

      <h2>What to remember for the KCNA</h2>

      <ul>
        <li>A controller is a loop that observes desired vs real state and acts to converge them.</li>
        <li>Controllers talk to the apiserver, never to etcd directly.</li>
        <li>Controllers are <em>independent</em>: each watches its own resources, and the system emerges from their collaboration.</li>
        <li>The <em>Operator pattern</em> = CRD + custom controller. The natural extension of the model.</li>
      </ul>

      <p>With this you understand 100% of how the declarative model works. In the next sub-part we open the piece that keeps the API from being closed: CRDs.</p>
    `,
};
