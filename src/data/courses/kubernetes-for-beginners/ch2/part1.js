export default {
  es: `
      <p>En el <a href="/course/kubernetes-for-beginners/architecture">capítulo anterior</a> vimos la topografía: qué procesos corren dónde y cómo fluyen los eventos entre ellos. Ahora bajamos una capa. Porque hay una palabra que repetimos todo el tiempo — <em>declarativo</em> — y que normalmente se explica mal. Muchos tutoriales la traducen como <em>"escribes YAML en vez de ejecutar comandos"</em>. Eso está bien como cliché, pero no captura lo que realmente significa ni por qué importa.</p>

      <p>Ser declarativo no es una convención de sintaxis. Es un <strong>contrato</strong> entre tú y el cluster: tú describes el estado que quieres, y el sistema se compromete a alcanzarlo y mantenerlo. Todo lo demás — objetos, controllers, apiserver, el loop de reconciliación — son consecuencias de ese contrato.</p>

      <h2>Imperativo vs declarativo: el contraste real</h2>

      <p>Imagina que quieres levantar tres réplicas de un servicio.</p>

      <p>En un mundo <strong>imperativo</strong> harías algo así:</p>

      <pre><code>ssh server1 "docker run -d my-app:v1"
ssh server2 "docker run -d my-app:v1"
ssh server3 "docker run -d my-app:v1"</code></pre>

      <p>Tres comandos, cada uno diciendo <em>"haz esto, ahora, aquí"</em>. Si uno falla, tú te enteras y lo reintenas. Si un servidor se cae mañana, tú te enteras y tú mueves el contenedor. Eres el controlador.</p>

      <p>En un mundo <strong>declarativo</strong>, en cambio, escribes:</p>

      <pre><code>apiVersion: apps/v1
kind: Deployment
spec:
  replicas: 3
  # ...</code></pre>

      <p>Y lo entregas al cluster. No le dices <em>dónde</em> ni <em>cómo</em> ni <em>cuándo</em>. Dices qué: <em>"quiero 3 réplicas de esto corriendo"</em>. El cluster se encarga del resto — elegir nodos, descargar imágenes, arrancar contenedores, y <strong>seguir haciéndolo</strong> si algo cambia. Si un nodo se cae, otro toma el relevo. Si mataste un Pod a mano, el controller lo recrea. Tu YAML no cambió, tu intención sigue vigente.</p>

      <h2>Por qué esto importa en sistemas distribuidos</h2>

      <p>El contrato declarativo no es elegancia — es una necesidad práctica. En un cluster con cientos de nodos y miles de Pods, las cosas fallan constantemente. Redes se cortan. Discos se llenan. Procesos crashean. Un modelo imperativo requeriría que alguien (tú, un humano, o un script complejo) reaccione a cada falla en tiempo real. Imposible a escala.</p>

      <p>El modelo declarativo resuelve eso con tres propiedades:</p>

      <ul>
        <li><strong>Idempotencia</strong>: aplicar el mismo YAML dos veces produce el mismo estado. No importa cuántas veces se reintente.</li>
        <li><strong>Convergencia</strong>: el sistema trabaja activamente para acercar el estado actual al deseado, bucle tras bucle, hasta que coincidan.</li>
        <li><strong>Retries gratis</strong>: como lo único que el cluster necesita es el estado deseado, cualquier operación se puede reintentar sin pensarlo.</li>
      </ul>

      <p>Esas tres propiedades son exactamente lo que necesitas para que un sistema distribuido sobreviva a sus propias fallas. El modelo declarativo es la forma que Kubernetes encontró para codificarlas.</p>

      <h2>El precio que pagas</h2>

      <p>A cambio, pierdes control fino sobre <em>cuándo</em> pasan las cosas. Tú pides "3 réplicas"; el scheduler decide cuándo arrancan, el kubelet decide cuándo descarga la imagen, el runtime decide cuándo se vuelve "running". No hay garantía de tiempos. Solo hay garantía de que, <em>eventualmente</em>, el estado observado va a coincidir con el deseado.</p>

      <p>Para la mayoría de cargas, ese es un trade-off aceptable. Para casos donde el tiempo importa — arranque ordenado, dependencias secuenciales — existen primitivas específicas (init containers, StatefulSets, readinessGates) que veremos más adelante.</p>

      <h2>Lo que vamos a ver en este capítulo</h2>

      <ol>
        <li><strong>Objetos, recursos y el loop de reconciliación</strong>: cómo se representa cada cosa en el cluster y qué significa <code>spec</code> vs <code>status</code>.</li>
        <li><strong>Grupos de API, versiones y anatomía de un objeto</strong>: cómo leer un YAML como un experto, qué significa <code>apps/v1</code> y por qué hay versiones alpha, beta y stable.</li>
        <li><strong>Controllers</strong>: el patrón que hace funcionar todo el modelo.</li>
        <li><strong>CRDs y extensibilidad</strong>: cómo la API no está fija — puedes añadirle tus propios tipos.</li>
        <li><strong>kubectl, <code>--dry-run</code> y server-side apply</strong>: lo que cambia cuando trabajas con el modelo declarativo desde la línea de comandos.</li>
      </ol>

      <p>Al terminar, cuando alguien diga <em>"Kubernetes es declarativo"</em>, no vas a asentir por reflejo — vas a saber exactamente qué implica eso a nivel de API, de controllers y de ingeniería distribuida.</p>
    `,
  en: `
      <p>In the <a href="/course/kubernetes-for-beginners/architecture">previous chapter</a> we saw the topography: which processes run where and how events flow between them. Now we go one layer deeper. There's a word we keep repeating — <em>declarative</em> — that is usually explained poorly. Many tutorials translate it as <em>"you write YAML instead of running commands"</em>. Fine as a cliché, but it doesn't capture what it really means or why it matters.</p>

      <p>Being declarative isn't a syntax convention. It's a <strong>contract</strong> between you and the cluster: you describe the state you want, and the system commits to reaching it and keeping it that way. Everything else — objects, controllers, apiserver, the reconciliation loop — are consequences of that contract.</p>

      <h2>Imperative vs declarative: the real contrast</h2>

      <p>Say you want to run three replicas of a service.</p>

      <p>In an <strong>imperative</strong> world you would do something like:</p>

      <pre><code>ssh server1 "docker run -d my-app:v1"
ssh server2 "docker run -d my-app:v1"
ssh server3 "docker run -d my-app:v1"</code></pre>

      <p>Three commands, each saying <em>"do this, now, here"</em>. If one fails, you find out and retry. If a server dies tomorrow, you find out and you move the container. You are the controller.</p>

      <p>In a <strong>declarative</strong> world, you write:</p>

      <pre><code>apiVersion: apps/v1
kind: Deployment
spec:
  replicas: 3
  # ...</code></pre>

      <p>And hand it to the cluster. You don't say <em>where</em>, <em>how</em>, or <em>when</em>. You say what: <em>"I want 3 replicas of this running"</em>. The cluster handles the rest — picking nodes, pulling images, starting containers, and <strong>keeping doing it</strong> if anything changes. If a node fails, another takes over. If you killed a Pod by hand, the controller recreates it. Your YAML didn't change, your intent still stands.</p>

      <h2>Why this matters in distributed systems</h2>

      <p>The declarative contract isn't about elegance — it's a practical necessity. In a cluster with hundreds of nodes and thousands of Pods, things fail constantly. Networks drop. Disks fill. Processes crash. An imperative model would require someone (you, a human, or a complex script) to react to every failure in real time. Impossible at scale.</p>

      <p>The declarative model solves that with three properties:</p>

      <ul>
        <li><strong>Idempotency</strong>: applying the same YAML twice produces the same state. No matter how many retries.</li>
        <li><strong>Convergence</strong>: the system actively works to bring the current state closer to the desired one, loop after loop, until they match.</li>
        <li><strong>Free retries</strong>: since the only thing the cluster needs is the desired state, any operation can be retried without thinking twice.</li>
      </ul>

      <p>Those three properties are exactly what you need so a distributed system can survive its own failures. The declarative model is how Kubernetes chose to encode them.</p>

      <h2>The price you pay</h2>

      <p>In exchange, you lose fine-grained control over <em>when</em> things happen. You ask for "3 replicas"; the scheduler decides when they start, kubelet decides when to pull the image, the runtime decides when it becomes "running". There's no timing guarantee. Only a guarantee that, <em>eventually</em>, the observed state will match the desired one.</p>

      <p>For most workloads, that's an acceptable trade-off. For cases where timing matters — ordered startup, sequential dependencies — there are specific primitives (init containers, StatefulSets, readinessGates) we'll see later.</p>

      <h2>What we'll cover in this chapter</h2>

      <ol>
        <li><strong>Objects, resources, and the reconciliation loop</strong>: how each thing is represented in the cluster and what <code>spec</code> vs <code>status</code> means.</li>
        <li><strong>API groups, versions, and the anatomy of an object</strong>: how to read a YAML like an expert, what <code>apps/v1</code> means, and why there are alpha, beta, and stable versions.</li>
        <li><strong>Controllers</strong>: the pattern that makes the whole model work.</li>
        <li><strong>CRDs and extensibility</strong>: how the API isn't fixed — you can add your own types.</li>
        <li><strong>kubectl, <code>--dry-run</code>, and server-side apply</strong>: what changes when you work with the declarative model from the command line.</li>
      </ol>

      <p>By the end, when someone says <em>"Kubernetes is declarative"</em>, you won't nod out of reflex — you'll know exactly what that implies at the API, controller, and distributed-systems levels.</p>
    `,
};
