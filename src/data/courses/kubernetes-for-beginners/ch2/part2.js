export default {
  es: `
      <p>Con la idea del contrato declarativo en mano, toca entender cómo el cluster la representa. Todo lo que existe en Kubernetes — un Pod, un Deployment, un Namespace, un Secret — se expresa como un <strong>objeto</strong>. Y cada objeto tiene una estructura muy específica, pensada justamente para el modelo declarativo.</p>

      <h2>Objeto vs recurso: la distinción que sí importa</h2>

      <p>Las palabras <em>objeto</em> y <em>recurso</em> se usan casi como sinónimos en la práctica, pero en la API tienen significado distinto.</p>

      <ul>
        <li>Un <strong>recurso</strong> (resource) es un <em>tipo</em>: <code>pods</code>, <code>deployments</code>, <code>services</code>. Es una entrada en el catálogo de la API. Cuando haces <code>kubectl api-resources</code>, lo que ves es la lista de recursos.</li>
        <li>Un <strong>objeto</strong> (object) es una <em>instancia</em> concreta de ese tipo: <em>"mi Pod <code>nginx-7d</code> en el namespace <code>default</code>"</em>.</li>
      </ul>

      <p>Analogía rápida: <em>"recurso"</em> es la clase, <em>"objeto"</em> es la instancia. En el día a día mezclas los términos sin problema, pero cuando leas documentación oficial o mensajes de error, vale la pena reconocerlos bien.</p>

      <h2>La anatomía: spec y status</h2>

      <p>Cada objeto en Kubernetes tiene dos secciones centrales:</p>

      <ul>
        <li><code>spec</code> — <strong>lo que tú declaras</strong>. El estado que quieres.</li>
        <li><code>status</code> — <strong>lo que el cluster reporta</strong>. El estado observado.</li>
      </ul>

      <p>Ejemplo rápido con un Deployment:</p>

      <pre><code>apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
spec:
  replicas: 3                # deseado
  selector:
    matchLabels:
      app: nginx
  template:
    # ... definición del Pod
status:
  replicas: 3                # actual
  readyReplicas: 2           # ¡todavía 1 no listo!
  updatedReplicas: 3
  conditions:
    - type: Available
      status: "True"</code></pre>

      <p>La pregunta que te hace Kubernetes es: <em>¿spec == status?</em>. Si sí, no hay nada que hacer. Si no, algún controller debería estar trabajando para que converjan.</p>

      <h2>La regla de oro: tú no tocas status</h2>

      <p>Este es uno de los malentendidos más comunes en cursos mal enseñados. Tú <strong>nunca escribes <code>status</code></strong>. Es un campo que pertenece al cluster: los controllers lo reportan, el apiserver lo persiste, y los clientes (incluido <code>kubectl</code>) lo leen.</p>

      <p>Si escribes <code>status</code> en tu YAML y lo aplicas, el apiserver lo acepta pero el primer controller que reconcilie ese objeto lo sobrescribirá. Pensar que editas <code>status</code> directamente es creer que puedes mentirle al cluster sobre el estado real — y el cluster siempre va a corregirte.</p>

      <div class="callout callout-note">
        <span class="callout-label">Detalle técnico</span>
        <p>Los controllers actualizan <code>status</code> mediante el subrecurso <code>/status</code> del objeto. Existe justamente para separar esa operación de las mutaciones normales de <code>spec</code>. Herramientas como <code>kubectl</code> ocultan esa separación; si alguna vez lees código de un controller verás llamadas como <code>client.Pods().UpdateStatus(...)</code> distintas de <code>Update(...)</code>.</p>
      </div>

      <h2>El loop de reconciliación, visto por un objeto</h2>

      <p>Ahora puedes ver el loop de reconciliación — que mencionamos muchas veces en el <a href="/course/kubernetes-for-beginners/architecture">capítulo anterior</a> — desde la óptica del objeto:</p>

      <ol>
        <li>Un cliente declara <code>spec</code> (vía <code>kubectl apply</code>).</li>
        <li>El apiserver persiste el objeto en etcd.</li>
        <li>Un controller vigila cambios en ese tipo de recurso y ve el objeto nuevo o modificado.</li>
        <li>El controller compara <code>spec</code> con el estado real observado en el cluster.</li>
        <li>Si difieren, el controller actúa (creando, modificando o borrando otros objetos).</li>
        <li>El controller actualiza <code>status</code> para reflejar lo que observó.</li>
        <li>Vuelve al paso 3.</li>
      </ol>

      <p>Ese loop, cuando se mira desde arriba con decenas de controllers corriendo a la vez, es lo que produce la sensación de que "Kubernetes simplemente funciona".</p>

      <h2>metadata y los campos universales</h2>

      <p>Además de <code>spec</code> y <code>status</code>, todo objeto tiene <code>metadata</code>, que es donde vive la información de identidad y organización:</p>

      <ul>
        <li><code>name</code> — único dentro de su namespace/alcance.</li>
        <li><code>namespace</code> — si el recurso es namespaced.</li>
        <li><code>labels</code> — pares key/value que <strong>se usan para selección</strong> (selectors).</li>
        <li><code>annotations</code> — pares key/value para metadatos que <em>no</em> se usan para seleccionar; los usan herramientas y humanos.</li>
        <li><code>uid</code> — identificador único asignado por el apiserver.</li>
        <li><code>resourceVersion</code> — la versión del objeto, crucial para el modelo watch y para detectar conflictos.</li>
        <li><code>ownerReferences</code> — qué otro objeto "es dueño" de este (un ReplicaSet es dueño de sus Pods, por ejemplo).</li>
      </ul>

      <p>La diferencia entre <code>labels</code> y <code>annotations</code> es clave: los <em>labels</em> se consultan con selectors (<code>kubectl get pods -l app=nginx</code>) y son parte del modelo de datos. Las <em>annotations</em> son texto libre — ahí guardas info útil para otras herramientas (versión del release, tracking ID, lo que quieras) pero que Kubernetes no interpreta.</p>

      <h2>Ya tienes la pieza central</h2>

      <p>Spec, status, metadata. Esos tres campos explican el 90% del modelo declarativo. Lo que veremos en el resto del capítulo son refinamientos: cómo se agrupan los recursos por API (sub-parte siguiente), cómo se construyen los controllers que cierran el loop, y cómo puedes extender la API con tus propios tipos.</p>
    `,
  en: `
      <p>With the declarative contract in mind, it's time to understand how the cluster represents it. Everything that exists in Kubernetes — a Pod, a Deployment, a Namespace, a Secret — is expressed as an <strong>object</strong>. And each object has a very specific structure, designed precisely for the declarative model.</p>

      <h2>Object vs resource: the distinction that actually matters</h2>

      <p>The words <em>object</em> and <em>resource</em> are used almost interchangeably in practice, but in the API they have distinct meanings.</p>

      <ul>
        <li>A <strong>resource</strong> is a <em>type</em>: <code>pods</code>, <code>deployments</code>, <code>services</code>. An entry in the API catalog. When you run <code>kubectl api-resources</code>, that list is what you see.</li>
        <li>An <strong>object</strong> is a concrete <em>instance</em> of that type: <em>"my Pod <code>nginx-7d</code> in namespace <code>default</code>"</em>.</li>
      </ul>

      <p>Quick analogy: <em>"resource"</em> is the class, <em>"object"</em> is the instance. Day to day you'll mix the terms without trouble, but when reading official docs or error messages it's worth knowing which is which.</p>

      <h2>The anatomy: spec and status</h2>

      <p>Every Kubernetes object has two central sections:</p>

      <ul>
        <li><code>spec</code> — <strong>what you declare</strong>. The desired state.</li>
        <li><code>status</code> — <strong>what the cluster reports</strong>. The observed state.</li>
      </ul>

      <p>Quick example with a Deployment:</p>

      <pre><code>apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
spec:
  replicas: 3                # desired
  selector:
    matchLabels:
      app: nginx
  template:
    # ... Pod definition
status:
  replicas: 3                # actual
  readyReplicas: 2           # one is still not ready!
  updatedReplicas: 3
  conditions:
    - type: Available
      status: "True"</code></pre>

      <p>The question Kubernetes asks is: <em>does spec == status?</em>. If yes, nothing to do. If no, some controller should be working to make them converge.</p>

      <h2>The golden rule: you never touch status</h2>

      <p>This is one of the most common misconceptions in badly taught courses. You <strong>never write <code>status</code></strong>. It's a field owned by the cluster: controllers report it, the apiserver persists it, and clients (including <code>kubectl</code>) read it.</p>

      <p>If you write <code>status</code> in your YAML and apply it, the apiserver accepts it, but the first controller that reconciles that object will overwrite it. Thinking you edit <code>status</code> directly is believing you can lie to the cluster about reality — and the cluster will always correct you.</p>

      <div class="callout callout-note">
        <span class="callout-label">Technical detail</span>
        <p>Controllers update <code>status</code> through the object's <code>/status</code> subresource. It exists precisely to separate that operation from normal <code>spec</code> mutations. Tools like <code>kubectl</code> hide the split; if you ever read a controller's code you'll see calls like <code>client.Pods().UpdateStatus(...)</code> distinct from <code>Update(...)</code>.</p>
      </div>

      <h2>The reconciliation loop, seen from an object</h2>

      <p>Now you can see the reconciliation loop — which we mentioned many times in the <a href="/course/kubernetes-for-beginners/architecture">previous chapter</a> — from the object's point of view:</p>

      <ol>
        <li>A client declares <code>spec</code> (via <code>kubectl apply</code>).</li>
        <li>The apiserver persists the object to etcd.</li>
        <li>A controller watches changes on that resource type and sees the new or modified object.</li>
        <li>The controller compares <code>spec</code> with the real observed state in the cluster.</li>
        <li>If they differ, the controller acts (creating, modifying, or deleting other objects).</li>
        <li>The controller updates <code>status</code> to reflect what it observed.</li>
        <li>Back to step 3.</li>
      </ol>

      <p>That loop, viewed from above with dozens of controllers running at once, is what produces the feeling that "Kubernetes just works".</p>

      <h2>metadata and the universal fields</h2>

      <p>Besides <code>spec</code> and <code>status</code>, every object has <code>metadata</code>, which is where identity and organization info live:</p>

      <ul>
        <li><code>name</code> — unique within its namespace/scope.</li>
        <li><code>namespace</code> — if the resource is namespaced.</li>
        <li><code>labels</code> — key/value pairs <strong>used for selection</strong> (selectors).</li>
        <li><code>annotations</code> — key/value pairs for metadata that is <em>not</em> used for selection; tools and humans use them.</li>
        <li><code>uid</code> — unique identifier assigned by the apiserver.</li>
        <li><code>resourceVersion</code> — the object's version, crucial for the watch model and for conflict detection.</li>
        <li><code>ownerReferences</code> — which other object "owns" this one (a ReplicaSet owns its Pods, for example).</li>
      </ul>

      <p>The difference between <code>labels</code> and <code>annotations</code> is key: <em>labels</em> are queried through selectors (<code>kubectl get pods -l app=nginx</code>) and are part of the data model. <em>Annotations</em> are free text — you put useful info there for other tools (release version, tracking ID, whatever), but Kubernetes does not interpret it.</p>

      <h2>You now have the central piece</h2>

      <p>Spec, status, metadata. Those three fields explain 90% of the declarative model. What we'll see in the rest of the chapter are refinements: how resources are grouped by API (next sub-part), how the controllers that close the loop are built, and how you can extend the API with your own types.</p>
    `,
};
