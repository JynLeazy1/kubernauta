export default {
  es: `
      <p>Cerramos el capítulo del Pod, que es el objeto más fundamental del cluster. Si solo te quedas con una idea, que sea esta: <strong>el Pod no es un contenedor con otro nombre, es el entorno donde uno o más contenedores existen</strong>. Todo lo demás se desprende de ahí.</p>

      <h2>El mapa mental</h2>

      <p>Un Pod es:</p>

      <ul>
        <li><strong>Un conjunto de namespaces de Linux</strong> (red, IPC, opcionalmente PID) creados antes que cualquier contenedor de aplicación.</li>
        <li><strong>Sostenidos por el contenedor <code>pause</code></strong>, que mantiene los namespaces vivos mientras los containers de la app se reinician.</li>
        <li><strong>Habitados por uno o más contenedores</strong> que comparten red (localhost), pueden compartir volúmenes, y viven y mueren juntos.</li>
        <li><strong>Efímeros</strong>: nadie los resucita por sí solo. La inteligencia de "mantén N corriendo" vive en los workload controllers.</li>
      </ul>

      <p>Cuando alguien dibuje un cuadradito etiquetado <em>Pod</em>, ya no es una caja vacía: es ese conjunto de namespaces con sus contenedores adentro.</p>

      <h2>Lo que vimos, comprimido</h2>

      <ul>
        <li><strong>Anatomía del manifest</strong>: <code>apiVersion: v1</code>, <code>kind: Pod</code>, <code>metadata</code>, <code>spec.containers</code>, opcionalmente <code>spec.volumes</code>, probes y <code>restartPolicy</code>.</li>
        <li><strong>Single vs multi-contenedor</strong>: la regla por default es uno; multi solo cuando los contenedores realmente <em>tienen que</em> vivir juntos.</li>
        <li><strong>Init containers, sidecars y ambassadors</strong>: los tres patrones clásicos. Sidecars nativos desde 1.29 con <code>restartPolicy: Always</code> en <code>initContainers</code>.</li>
        <li><strong>Ciclo de vida</strong>: phases, conditions, livenessProbe, readinessProbe, startupProbe, restartPolicy. CrashLoopBackOff = backoff exponencial.</li>
        <li><strong>Comandos</strong>: <code>get</code>, <code>describe</code>, <code>logs</code>, <code>exec</code> resuelven casi todo.</li>
        <li><strong>Quién gestiona Pods</strong>: Deployment / ReplicaSet, StatefulSet, DaemonSet, Job, CronJob.</li>
      </ul>

      <h2>Claves KCNA del capítulo</h2>

      <ul>
        <li>Pod = entorno compartido (no un contenedor solo).</li>
        <li>Todos los contenedores del Pod comparten IP y namespace de red. Hablan por <code>localhost</code>.</li>
        <li>Volúmenes se declaran en <code>spec.volumes</code> y se montan con <code>volumeMounts</code> por contenedor.</li>
        <li>Init containers corren antes y secuencialmente; deben terminar OK.</li>
        <li>livenessProbe → reinicia. readinessProbe → quita IP de Service endpoints. startupProbe → solo al arranque.</li>
        <li>Default <code>restartPolicy: Always</code>. Jobs usan <code>OnFailure</code> o <code>Never</code>.</li>
        <li>En producción, los Pods los gestiona un controller — no tú.</li>
      </ul>

      <h2>Qué viene</h2>

      <p>El siguiente capítulo aborda el controller que más vas a tocar en tu vida con Kubernetes: <a href="/course/kubernetes-for-beginners/replicasets-and-deployments">ReplicaSets y Deployments</a>. Vamos a ver cómo Kubernetes mantiene N réplicas, cómo el Deployment orquesta rolling updates, qué son los labels y selectors, y cómo se hace un rollback cuando algo sale mal.</p>

      <p>De ahí en adelante, cada capítulo abre un objeto distinto (Service, Namespace, Ingress, …), pero el patrón siempre es el mismo: <em>qué declara, qué controller lo reconcilia, qué pasa con los Pods que crea</em>. Este capítulo te dejó la base sobre la cual va a apoyarse todo lo demás.</p>
    `,
  en: `
      <p>We're closing the Pod chapter, the most fundamental object in the cluster. If you take only one idea, let it be this: <strong>a Pod is not a container by another name; it's the environment where one or more containers exist</strong>. Everything else follows from that.</p>

      <h2>The mental map</h2>

      <p>A Pod is:</p>

      <ul>
        <li><strong>A set of Linux namespaces</strong> (network, IPC, optionally PID) created before any application container.</li>
        <li><strong>Held alive by the <code>pause</code> container</strong>, which keeps the namespaces around while app containers restart.</li>
        <li><strong>Inhabited by one or more containers</strong> that share networking (localhost), can share volumes, and live and die together.</li>
        <li><strong>Ephemeral</strong>: nobody resurrects them on their own. The "keep N running" intelligence lives in workload controllers.</li>
      </ul>

      <p>When someone draws a little box labeled <em>Pod</em>, it's no longer an empty box: it's that namespace bundle with its containers inside.</p>

      <h2>What we saw, compressed</h2>

      <ul>
        <li><strong>Manifest anatomy</strong>: <code>apiVersion: v1</code>, <code>kind: Pod</code>, <code>metadata</code>, <code>spec.containers</code>, optionally <code>spec.volumes</code>, probes, and <code>restartPolicy</code>.</li>
        <li><strong>Single vs multi-container</strong>: default to one; multi only when containers really <em>have</em> to live together.</li>
        <li><strong>Init containers, sidecars, and ambassadors</strong>: the three classic patterns. Native sidecars since 1.29 via <code>restartPolicy: Always</code> on <code>initContainers</code>.</li>
        <li><strong>Lifecycle</strong>: phases, conditions, livenessProbe, readinessProbe, startupProbe, restartPolicy. CrashLoopBackOff = exponential backoff.</li>
        <li><strong>Commands</strong>: <code>get</code>, <code>describe</code>, <code>logs</code>, <code>exec</code> handle almost everything.</li>
        <li><strong>Who manages Pods</strong>: Deployment / ReplicaSet, StatefulSet, DaemonSet, Job, CronJob.</li>
      </ul>

      <h2>KCNA keys from the chapter</h2>

      <ul>
        <li>Pod = shared environment (not a container alone).</li>
        <li>All containers in the Pod share IP and network namespace. They talk over <code>localhost</code>.</li>
        <li>Volumes are declared in <code>spec.volumes</code> and mounted via <code>volumeMounts</code> per container.</li>
        <li>Init containers run first and sequentially; must finish OK.</li>
        <li>livenessProbe → restart. readinessProbe → remove IP from Service endpoints. startupProbe → only at startup.</li>
        <li>Default <code>restartPolicy: Always</code>. Jobs use <code>OnFailure</code> or <code>Never</code>.</li>
        <li>In production, Pods are managed by a controller — not by you.</li>
      </ul>

      <h2>What's next</h2>

      <p>The next chapter tackles the controller you'll touch most in your Kubernetes life: <a href="/course/kubernetes-for-beginners/replicasets-and-deployments">ReplicaSets and Deployments</a>. We'll see how Kubernetes keeps N replicas, how the Deployment orchestrates rolling updates, what labels and selectors are, and how to roll back when something goes wrong.</p>

      <p>From here on, every chapter opens a different object (Service, Namespace, Ingress, …), but the pattern is always the same: <em>what it declares, which controller reconciles it, what happens to the Pods it creates</em>. This chapter gave you the foundation everything else will lean on.</p>
    `,
}
