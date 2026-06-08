export default {
  es: `
      <p>Abre cualquier YAML de Kubernetes y lo primero que ves son dos líneas:</p>

      <pre><code>apiVersion: apps/v1
kind: Deployment</code></pre>

      <p>Esas dos líneas son la "dirección" del objeto dentro de la API: dicen <em>a qué grupo y versión pertenece</em>, y <em>qué tipo es</em>. Entenderlas elimina una enorme cantidad de confusión — la de no saber por qué a veces es <code>apps/v1</code>, a veces <code>v1</code> a secas, y a veces algo como <code>networking.k8s.io/v1</code>.</p>

      <h2>Grupos de API</h2>

      <p>La API de Kubernetes está organizada en <strong>grupos</strong>. Cada grupo agrupa tipos relacionados. Esto permite evolucionar partes de la API de forma independiente sin romper las demás.</p>

      <p>Hay dos grandes categorías:</p>

      <ul>
        <li><strong>El grupo <em>core</em> (también llamado <em>legacy</em>)</strong> — contiene los tipos más antiguos y fundamentales: Pod, Service, Namespace, ConfigMap, Secret, Node, PersistentVolume, etc. Su <code>apiVersion</code> no lleva prefijo: solo <code>v1</code>.</li>
        <li><strong>Grupos con nombre</strong> — todo lo demás. Cada grupo tiene un nombre como <code>apps</code>, <code>batch</code>, <code>networking.k8s.io</code>, <code>rbac.authorization.k8s.io</code>. Su <code>apiVersion</code> se escribe <code>grupo/versión</code>, por ejemplo <code>apps/v1</code>.</li>
      </ul>

      <p>Algunos ejemplos cotidianos:</p>

      <pre><code>apiVersion: v1                         # core
kind: Pod

apiVersion: apps/v1                    # grupo apps
kind: Deployment

apiVersion: batch/v1                   # grupo batch
kind: Job

apiVersion: networking.k8s.io/v1       # grupo networking.k8s.io
kind: NetworkPolicy

apiVersion: rbac.authorization.k8s.io/v1   # grupo RBAC
kind: Role</code></pre>

      <p>Para ver todos los grupos disponibles en tu cluster:</p>

      <pre><code>kubectl api-versions</code></pre>

      <p>Y para ver todos los recursos (con sus grupos):</p>

      <pre><code>kubectl api-resources</code></pre>

      <p>La salida de <code>api-resources</code> incluye un nombre corto (<code>po</code> para Pods, <code>deploy</code> para Deployments), si el recurso es namespaced, y a qué grupo pertenece. Es una de las salidas más útiles para orientarte.</p>

      <h2>Versiones: alpha, beta, stable</h2>

      <p>Dentro de cada grupo, un tipo puede existir en varias versiones a la vez. El sufijo de la versión dice su nivel de madurez:</p>

      <ul>
        <li><strong><code>v1</code></strong> — <em>stable</em> / GA. Compatible hacia adelante por toda la vida de la major version. Es la versión que deberías usar en producción.</li>
        <li><strong><code>v1beta1</code>, <code>v1beta2</code></strong> — <em>beta</em>. Razonablemente estable, bien probada, pero la API puede cambiar con deprecation. Habilitada por defecto.</li>
        <li><strong><code>v1alpha1</code></strong> — <em>alpha</em>. Experimental. La API puede cambiar sin previo aviso, los bugs son posibles. Suele estar <strong>deshabilitada por defecto</strong> y hay que activarla con feature flags.</li>
      </ul>

      <p>La regla práctica: si un tipo tiene una versión estable (<code>v1</code>), úsala. Las versiones alpha solo tienen sentido cuando necesitas una feature muy nueva o estás construyendo algo experimental.</p>

      <h2>Cómo se promueve una API</h2>

      <p>La vida típica de una API en Kubernetes:</p>

      <ol>
        <li><strong>Alpha</strong> (<code>v1alpha1</code>, <code>v1alpha2</code>…): feature flag-gated, puede cambiar o desaparecer.</li>
        <li><strong>Beta</strong> (<code>v1beta1</code>, <code>v1beta2</code>…): habilitada por defecto, compatible dentro de la beta pero puede cambiar entre betas.</li>
        <li><strong>Stable</strong> (<code>v1</code>): compromiso de compatibilidad a largo plazo.</li>
      </ol>

      <p>Cuando una API se promueve, las versiones viejas quedan <em>deprecated</em> y eventualmente se eliminan. Por eso a veces ves warnings como <em>"apiVersion extensions/v1beta1 is deprecated"</em> — el tipo aún funciona, pero ya hay una versión estable que debes usar en su lugar.</p>

      <div class="callout callout-warning">
        <span class="callout-label">Atención</span>
        <p>Los upgrades de Kubernetes pueden eliminar APIs antiguas. Si tu YAML usa <code>apiVersion: extensions/v1beta1</code> para un Deployment (removida en 1.16), el upgrade va a romperlo. Antes de actualizar un cluster, revisa con herramientas como <code>kubectl deprecations</code> o <code>pluto</code> para encontrar APIs deprecadas.</p>
      </div>

      <h2>Anatomía completa de un objeto</h2>

      <p>Ya vimos <code>spec</code>, <code>status</code> y <code>metadata</code>. Juntos, con <code>apiVersion</code> y <code>kind</code>, forman la estructura completa:</p>

      <pre><code>apiVersion: apps/v1                    # grupo y versión
kind: Deployment                       # tipo
metadata:                              # identidad y organización
  name: nginx
  namespace: default
  labels:
    app: nginx
  annotations:
    deployment.kubernetes.io/revision: "1"
spec:                                  # estado deseado
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
        - name: nginx
          image: nginx:1.25
status:                                # estado observado (no lo escribas)
  replicas: 3
  readyReplicas: 3
  availableReplicas: 3</code></pre>

      <p>Esos cinco campos top-level — <code>apiVersion</code>, <code>kind</code>, <code>metadata</code>, <code>spec</code>, <code>status</code> — existen en prácticamente todo objeto de Kubernetes. Si ves un YAML y no encuentras alguno, sospecha antes de aplicar.</p>

      <h2>Descubriendo la API del cluster</h2>

      <p>Un dato útil: el propio apiserver expone su documentación. Puedes pedirle la descripción completa de cualquier tipo:</p>

      <pre><code>kubectl explain deployment
kubectl explain deployment.spec
kubectl explain deployment.spec.template.spec.containers --recursive</code></pre>

      <p>Eso devuelve los campos válidos, sus tipos, y una descripción breve. Es la fuente autoritativa — más fiel a tu cluster que cualquier tutorial, porque refleja exactamente la versión que tienes instalada.</p>

      <p>En la sub-parte siguiente formalizamos los controllers: qué son, cómo se construyen, y por qué son el motor del modelo declarativo.</p>
    `,
  en: `
      <p>Open any Kubernetes YAML and the first thing you see is two lines:</p>

      <pre><code>apiVersion: apps/v1
kind: Deployment</code></pre>

      <p>Those two lines are the object's "address" inside the API: they say <em>which group and version it belongs to</em> and <em>what type it is</em>. Understanding them clears up a huge amount of confusion — not knowing why it's sometimes <code>apps/v1</code>, sometimes just <code>v1</code>, and sometimes something like <code>networking.k8s.io/v1</code>.</p>

      <h2>API groups</h2>

      <p>The Kubernetes API is organized in <strong>groups</strong>. Each group bundles related types. This lets parts of the API evolve independently without breaking the others.</p>

      <p>There are two big categories:</p>

      <ul>
        <li><strong>The <em>core</em> group (also called <em>legacy</em>)</strong> — contains the oldest, most fundamental types: Pod, Service, Namespace, ConfigMap, Secret, Node, PersistentVolume, etc. Its <code>apiVersion</code> has no prefix: just <code>v1</code>.</li>
        <li><strong>Named groups</strong> — everything else. Each group has a name like <code>apps</code>, <code>batch</code>, <code>networking.k8s.io</code>, <code>rbac.authorization.k8s.io</code>. Its <code>apiVersion</code> is written <code>group/version</code>, for instance <code>apps/v1</code>.</li>
      </ul>

      <p>Some everyday examples:</p>

      <pre><code>apiVersion: v1                         # core
kind: Pod

apiVersion: apps/v1                    # apps group
kind: Deployment

apiVersion: batch/v1                   # batch group
kind: Job

apiVersion: networking.k8s.io/v1       # networking.k8s.io group
kind: NetworkPolicy

apiVersion: rbac.authorization.k8s.io/v1   # RBAC group
kind: Role</code></pre>

      <p>To see all available groups in your cluster:</p>

      <pre><code>kubectl api-versions</code></pre>

      <p>And all resources (with their groups):</p>

      <pre><code>kubectl api-resources</code></pre>

      <p>The <code>api-resources</code> output includes a short name (<code>po</code> for Pods, <code>deploy</code> for Deployments), whether the resource is namespaced, and which group it belongs to. One of the most useful outputs to orient yourself.</p>

      <h2>Versions: alpha, beta, stable</h2>

      <p>Within a group, a type can exist in several versions at once. The version suffix signals maturity:</p>

      <ul>
        <li><strong><code>v1</code></strong> — <em>stable</em> / GA. Forward-compatible for the life of the major version. The version you should use in production.</li>
        <li><strong><code>v1beta1</code>, <code>v1beta2</code></strong> — <em>beta</em>. Reasonably stable, well tested, but the API can change with deprecation. Enabled by default.</li>
        <li><strong><code>v1alpha1</code></strong> — <em>alpha</em>. Experimental. The API can change without notice, bugs are possible. Usually <strong>disabled by default</strong> and must be turned on with feature flags.</li>
      </ul>

      <p>Practical rule: if a type has a stable version (<code>v1</code>), use it. Alpha versions only make sense when you need a brand-new feature or are building something experimental.</p>

      <h2>How an API gets promoted</h2>

      <p>Typical life of a Kubernetes API:</p>

      <ol>
        <li><strong>Alpha</strong> (<code>v1alpha1</code>, <code>v1alpha2</code>…): feature-flag gated, may change or disappear.</li>
        <li><strong>Beta</strong> (<code>v1beta1</code>, <code>v1beta2</code>…): enabled by default, compatible within beta but may change between betas.</li>
        <li><strong>Stable</strong> (<code>v1</code>): long-term compatibility commitment.</li>
      </ol>

      <p>When an API is promoted, the older versions become <em>deprecated</em> and are eventually removed. That's why you sometimes see warnings like <em>"apiVersion extensions/v1beta1 is deprecated"</em> — the type still works, but there's already a stable version you should use instead.</p>

      <div class="callout callout-warning">
        <span class="callout-label">Warning</span>
        <p>Kubernetes upgrades can remove old APIs. If your YAML uses <code>apiVersion: extensions/v1beta1</code> for a Deployment (removed in 1.16), the upgrade will break it. Before upgrading a cluster, check with tools like <code>kubectl deprecations</code> or <code>pluto</code> to find deprecated APIs.</p>
      </div>

      <h2>The full anatomy of an object</h2>

      <p>We've seen <code>spec</code>, <code>status</code>, and <code>metadata</code>. Together, with <code>apiVersion</code> and <code>kind</code>, they form the full structure:</p>

      <pre><code>apiVersion: apps/v1                    # group and version
kind: Deployment                       # type
metadata:                              # identity and organization
  name: nginx
  namespace: default
  labels:
    app: nginx
  annotations:
    deployment.kubernetes.io/revision: "1"
spec:                                  # desired state
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
        - name: nginx
          image: nginx:1.25
status:                                # observed state (don't write it)
  replicas: 3
  readyReplicas: 3
  availableReplicas: 3</code></pre>

      <p>Those five top-level fields — <code>apiVersion</code>, <code>kind</code>, <code>metadata</code>, <code>spec</code>, <code>status</code> — exist in practically every Kubernetes object. If you see a YAML missing one, be suspicious before you apply.</p>

      <h2>Discovering the cluster's API</h2>

      <p>A useful fact: the apiserver itself exposes its own documentation. You can ask it for the full description of any type:</p>

      <pre><code>kubectl explain deployment
kubectl explain deployment.spec
kubectl explain deployment.spec.template.spec.containers --recursive</code></pre>

      <p>That returns the valid fields, their types, and a brief description. It's the authoritative source — more faithful to your cluster than any tutorial, because it reflects exactly the version you have installed.</p>

      <p>In the next sub-part we formalize controllers: what they are, how they're built, and why they are the engine of the declarative model.</p>
    `,
}
