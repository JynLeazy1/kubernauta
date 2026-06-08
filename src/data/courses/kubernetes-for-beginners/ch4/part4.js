export default {
  es: `
      <p>Si Kubernetes tuviera un sistema de tipos invisible, las <strong>labels</strong> y los <strong>selectors</strong> serían su sistema de tipos. Es lo que conecta cosas: ReplicaSet con sus Pods, Service con sus endpoints, NetworkPolicy con sus reglas. Sin labels, todos los objetos del cluster serían islas.</p>

      <h2>Qué son las labels</h2>

      <p>Una <strong>label</strong> es un par <code>key: value</code> que vive en <code>metadata.labels</code> de cualquier objeto. Las usas para clasificar:</p>

      <pre><code>metadata:
  name: web-7d4f
  labels:
    app: web
    tier: frontend
    environment: production
    version: "1.27"</code></pre>

      <p>Reglas a tener en mente:</p>

      <ul>
        <li>Las keys pueden tener prefijo (<code>app.kubernetes.io/name</code>) — útil para evitar choques con otros tools.</li>
        <li>Los values son strings (los números van entre comillas).</li>
        <li>Múltiples objetos pueden tener las mismas labels — eso es justamente lo que las hace útiles.</li>
      </ul>

      <h2>Qué son los selectors</h2>

      <p>Un <strong>selector</strong> es una expresión que filtra objetos por sus labels. Hay dos sintaxis:</p>

      <h3>Equality-based</h3>

      <pre><code>selector:
  matchLabels:
    app: web
    tier: frontend</code></pre>

      <p>Selecciona objetos que tengan <em>todas</em> esas labels con esos valores exactos. Es la sintaxis que usan ReplicaSet, Service, NetworkPolicy.</p>

      <h3>Set-based</h3>

      <pre><code>selector:
  matchExpressions:
    - key: tier
      operator: In
      values: [frontend, backend]
    - key: environment
      operator: NotIn
      values: [development]
    - key: critical
      operator: Exists</code></pre>

      <p>Más expresiva: <code>In</code>, <code>NotIn</code>, <code>Exists</code>, <code>DoesNotExist</code>. Algunos objetos (Deployment, StatefulSet, DaemonSet) admiten esta sintaxis además de matchLabels.</p>

      <h2>Cómo se usan en la práctica</h2>

      <p>Cada objeto que tiene un campo <code>selector</code> en su spec está apuntando a un grupo de objetos vía sus labels. Algunos casos:</p>

      <ul>
        <li><strong>ReplicaSet → Pods</strong>: el RS cuenta como suyos los Pods que matcheen <code>spec.selector</code>.</li>
        <li><strong>Service → Pods</strong>: el Service rutea tráfico a los Pods que matcheen su <code>spec.selector</code>. Si los Pods cambian (mueren, escalan), el Service se actualiza solo.</li>
        <li><strong>Deployment → ReplicaSets → Pods</strong>: el Deployment usa labels (más una <em>pod-template-hash</em> que añade el controller) para distinguir el RS actual del anterior.</li>
        <li><strong>NetworkPolicy → Pods</strong>: define qué Pods pueden hablar con qué otros, identificándolos por labels.</li>
      </ul>

      <p>Es por esto que cuando defines un Deployment, el <code>selector.matchLabels</code> tiene que matchear las labels de <code>template.metadata.labels</code>. Si no, el ReplicaSet creado no encuentra a sus propios Pods, y el sistema entra en loop creando réplicas que no se cuentan.</p>

      <h2>Filtrar con kubectl</h2>

      <p>Las labels también te dejan filtrar desde la línea de comandos:</p>

      <pre><code>kubectl get pods -l app=web                          # equality
kubectl get pods -l 'tier in (frontend,backend)'     # set-based
kubectl get pods -l 'environment!=development'
kubectl get pods -l app=web,environment=production   # AND de varias
kubectl get pods -l '!critical'                      # Pods sin la label critical</code></pre>

      <p>Combinado con <code>--all-namespaces</code> y <code>-o wide</code>, te da un buscador potente del cluster entero.</p>

      <h2>Annotations: parecen labels pero no son</h2>

      <p>Hay un primo cercano: las <strong>annotations</strong> en <code>metadata.annotations</code>. Misma forma <code>key: value</code>, distinto propósito:</p>

      <ul>
        <li><strong>Labels</strong> — para selección. Kubernetes y los controllers las consultan.</li>
        <li><strong>Annotations</strong> — para metadatos que <em>no</em> se usan para seleccionar. Aquí guardas información que les sirve a herramientas externas o a humanos: build IDs, hash de configuración, links a runbooks, lo que quieras.</li>
      </ul>

      <pre><code>metadata:
  labels:
    app: web              # Kubernetes la usa
  annotations:
    deployment.kubernetes.io/revision: "5"
    git-commit: "a3f5d72"
    runbook: "https://wiki.example.com/web-runbook"</code></pre>

      <p>Si dudas si algo va en label o en annotation, hazte la pregunta: <em>¿voy a filtrar por esto?</em>. Sí → label. No → annotation.</p>

      <h2>Las labels recomendadas (estándar)</h2>

      <p>La <a href="https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/" target="_blank" rel="noopener noreferrer">documentación oficial</a> propone un set de labels comunes con el prefijo <code>app.kubernetes.io/</code>:</p>

      <ul>
        <li><code>app.kubernetes.io/name</code></li>
        <li><code>app.kubernetes.io/instance</code></li>
        <li><code>app.kubernetes.io/version</code></li>
        <li><code>app.kubernetes.io/component</code></li>
        <li><code>app.kubernetes.io/part-of</code></li>
        <li><code>app.kubernetes.io/managed-by</code></li>
      </ul>

      <p>No son obligatorias, pero usarlas hace que herramientas como Helm, kustomize, Argo CD y dashboards de monitoring entiendan tus recursos sin configuración extra.</p>

      <h2>Para la KCNA</h2>

      <ul>
        <li>Las labels son <code>key: value</code> y se usan para selección. Las annotations también son <code>key: value</code> pero <em>no</em> se usan para selección.</li>
        <li>Selectores: <code>matchLabels</code> (equality) o <code>matchExpressions</code> (set: In, NotIn, Exists, DoesNotExist).</li>
        <li>El <code>spec.selector</code> de un Deployment debe matchear las labels del <code>spec.template</code>.</li>
        <li><code>kubectl get -l</code> filtra por label desde la línea de comandos.</li>
        <li>Convención <code>app.kubernetes.io/*</code> para labels comunes.</li>
      </ul>

      <p>En la siguiente sub-parte vemos los comandos de día a día: escalar, actualizar la imagen, mirar el rollout, y los YAMLs que pasan exactamente por debajo cuando los corres.</p>
    `,
  en: `
      <p>If Kubernetes had an invisible type system, <strong>labels</strong> and <strong>selectors</strong> would be it. They're what connects things: ReplicaSet to its Pods, Service to its endpoints, NetworkPolicy to its rules. Without labels, every object in the cluster would be an island.</p>

      <h2>What labels are</h2>

      <p>A <strong>label</strong> is a <code>key: value</code> pair that lives under <code>metadata.labels</code> on any object. You use them to classify:</p>

      <pre><code>metadata:
  name: web-7d4f
  labels:
    app: web
    tier: frontend
    environment: production
    version: "1.27"</code></pre>

      <p>Rules to keep in mind:</p>

      <ul>
        <li>Keys can have a prefix (<code>app.kubernetes.io/name</code>) — useful to avoid clashes with other tools.</li>
        <li>Values are strings (numbers go in quotes).</li>
        <li>Multiple objects can share the same labels — that's exactly what makes them useful.</li>
      </ul>

      <h2>What selectors are</h2>

      <p>A <strong>selector</strong> is an expression that filters objects by their labels. There are two flavors:</p>

      <h3>Equality-based</h3>

      <pre><code>selector:
  matchLabels:
    app: web
    tier: frontend</code></pre>

      <p>Selects objects that have <em>all</em> those labels with those exact values. This is the syntax used by ReplicaSet, Service, NetworkPolicy.</p>

      <h3>Set-based</h3>

      <pre><code>selector:
  matchExpressions:
    - key: tier
      operator: In
      values: [frontend, backend]
    - key: environment
      operator: NotIn
      values: [development]
    - key: critical
      operator: Exists</code></pre>

      <p>More expressive: <code>In</code>, <code>NotIn</code>, <code>Exists</code>, <code>DoesNotExist</code>. Some objects (Deployment, StatefulSet, DaemonSet) accept this syntax in addition to matchLabels.</p>

      <h2>How they're used in practice</h2>

      <p>Every object with a <code>selector</code> field in its spec is pointing at a group of objects via their labels. A few cases:</p>

      <ul>
        <li><strong>ReplicaSet → Pods</strong>: the RS counts as its own any Pods matching <code>spec.selector</code>.</li>
        <li><strong>Service → Pods</strong>: the Service routes traffic to Pods matching its <code>spec.selector</code>. If the Pods change (die, scale), the Service updates by itself.</li>
        <li><strong>Deployment → ReplicaSets → Pods</strong>: the Deployment uses labels (plus a <em>pod-template-hash</em> the controller adds) to tell the current RS apart from the previous one.</li>
        <li><strong>NetworkPolicy → Pods</strong>: defines which Pods can talk to which others, identifying them by labels.</li>
      </ul>

      <p>This is why, when you write a Deployment, the <code>selector.matchLabels</code> must match the <code>template.metadata.labels</code>. Otherwise, the ReplicaSet that's created can't find its own Pods, and the system loops creating replicas that don't get counted.</p>

      <h2>Filtering with kubectl</h2>

      <p>Labels also let you filter from the command line:</p>

      <pre><code>kubectl get pods -l app=web                          # equality
kubectl get pods -l 'tier in (frontend,backend)'     # set-based
kubectl get pods -l 'environment!=development'
kubectl get pods -l app=web,environment=production   # AND of several
kubectl get pods -l '!critical'                      # Pods without the critical label</code></pre>

      <p>Combined with <code>--all-namespaces</code> and <code>-o wide</code>, this is a powerful search across the whole cluster.</p>

      <h2>Annotations: look like labels, aren't</h2>

      <p>There's a close cousin: <strong>annotations</strong> under <code>metadata.annotations</code>. Same <code>key: value</code> shape, different purpose:</p>

      <ul>
        <li><strong>Labels</strong> — for selection. Kubernetes and controllers query them.</li>
        <li><strong>Annotations</strong> — for metadata <em>not</em> used for selection. This is where you store info for external tools or humans: build IDs, config hashes, runbook links, whatever.</li>
      </ul>

      <pre><code>metadata:
  labels:
    app: web              # Kubernetes uses it
  annotations:
    deployment.kubernetes.io/revision: "5"
    git-commit: "a3f5d72"
    runbook: "https://wiki.example.com/web-runbook"</code></pre>

      <p>If you're unsure whether something is a label or annotation, ask yourself: <em>am I going to filter on this?</em>. Yes → label. No → annotation.</p>

      <h2>Recommended (standard) labels</h2>

      <p>The <a href="https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/" target="_blank" rel="noopener noreferrer">official docs</a> propose a set of common labels with the <code>app.kubernetes.io/</code> prefix:</p>

      <ul>
        <li><code>app.kubernetes.io/name</code></li>
        <li><code>app.kubernetes.io/instance</code></li>
        <li><code>app.kubernetes.io/version</code></li>
        <li><code>app.kubernetes.io/component</code></li>
        <li><code>app.kubernetes.io/part-of</code></li>
        <li><code>app.kubernetes.io/managed-by</code></li>
      </ul>

      <p>They're not required, but using them lets tools like Helm, kustomize, Argo CD, and monitoring dashboards understand your resources with no extra config.</p>

      <h2>For the KCNA</h2>

      <ul>
        <li>Labels are <code>key: value</code> and are used for selection. Annotations are also <code>key: value</code> but are <em>not</em> used for selection.</li>
        <li>Selectors: <code>matchLabels</code> (equality) or <code>matchExpressions</code> (set: In, NotIn, Exists, DoesNotExist).</li>
        <li>A Deployment's <code>spec.selector</code> must match the labels in <code>spec.template</code>.</li>
        <li><code>kubectl get -l</code> filters by label from the command line.</li>
        <li><code>app.kubernetes.io/*</code> convention for common labels.</li>
      </ul>

      <p>In the next sub-part we look at the day-to-day commands: scale, update the image, watch the rollout, and the YAML that runs underneath when you do.</p>
    `,
}
