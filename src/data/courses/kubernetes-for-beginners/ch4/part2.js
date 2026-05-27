export default {
  es: `
      <p>Vamos al ReplicaSet primero. Es la pieza más simple de los dos, y todo lo que el Deployment hace después se apoya en ella. Si entiendes el ReplicaSet, el Deployment se vuelve "ReplicaSet con superpoderes de versión".</p>

      <h2>Qué hace exactamente</h2>

      <p>Un <code>ReplicaSet</code> tiene un trabajo de una sola línea: <strong>asegurarse de que haya siempre <em>N</em> Pods que matcheen su selector</strong>. Donde <em>N</em> es el campo <code>replicas</code> y el <em>selector</em> es un conjunto de labels.</p>

      <p>Su loop de reconciliación, en pseudocódigo:</p>

      <pre><code>while True:
    pods = api.list_pods(matching=selector)
    actual = len([p for p in pods if not p.deletionTimestamp])
    if actual < replicas:
        api.create_pod(template)
    elif actual > replicas:
        api.delete_pod(elegir_uno(pods))</code></pre>

      <p class="source-note">Pseudocódigo ilustrativo. La implementación real está en <a href="https://github.com/kubernetes/kubernetes/blob/master/pkg/controller/replicaset/" target="_blank" rel="noopener noreferrer">kubernetes/pkg/controller/replicaset</a>.</p>

      <p>Eso es todo. No actualiza imágenes, no rota versiones, no hace rolling updates. Solo cuenta y completa la diferencia.</p>

      <h2>Anatomía de un ReplicaSet</h2>

      <pre><code>apiVersion: apps/v1
kind: ReplicaSet
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web         # los Pods que crea el RS deben matchear el selector
    spec:
      containers:
        - name: nginx
          image: nginx:1.27</code></pre>

      <p>Los tres campos clave:</p>

      <ul>
        <li><strong><code>replicas</code></strong>: cuántos Pods se quieren.</li>
        <li><strong><code>selector</code></strong>: qué Pods cuenta como suyos. Cualquier Pod en el namespace cuyas labels matcheen el selector "pertenece" al ReplicaSet.</li>
        <li><strong><code>template</code></strong>: la spec del Pod que va a crear cuando le falten réplicas. Las labels del template deben matchear el selector — si no, los Pods recién creados no se cuentan y el RS los recrea infinitamente. Es uno de los errores clásicos.</li>
      </ul>

      <h2>Adopción de Pods sueltos</h2>

      <p>Una propiedad rara pero real: si creas un Pod manualmente con las labels que matcheen el selector de un ReplicaSet existente, ese Pod queda <em>adoptado</em>. El RS lo cuenta como propio. Si su <code>replicas</code> ya estaba satisfecho, el RS va a matar uno (puede ser el tuyo, puede ser otro). Si faltaba, lo cuenta y deja de crear nuevos.</p>

      <p>Es bueno saberlo para diagnosticar misterios del tipo <em>"creé un Pod y desapareció solo"</em>. La explicación suele ser: alguna label coincide con un selector existente.</p>

      <h2>Por qué casi no se crean a mano</h2>

      <p>Un ReplicaSet por sí solo te da <em>self-healing</em> y <em>escalado horizontal</em> — pero no rolling updates. Si cambias <code>spec.template.spec.containers[0].image</code> de un ReplicaSet existente:</p>

      <ul>
        <li>Los Pods que ya corren <strong>no se actualizan</strong>. Siguen con la imagen vieja.</li>
        <li>Solo los Pods que el RS cree <em>después</em> del cambio usarán la imagen nueva.</li>
      </ul>

      <p>Para forzar una actualización tendrías que ir matando Pods uno por uno y dejar que el RS los recree. Es manual, propenso a errores, y no te da rollback. Por eso existe el Deployment.</p>

      <h2>Cuándo aparece un ReplicaSet "huérfano"</h2>

      <p>Cada vez que un Deployment hace un rolling update, deja atrás el ReplicaSet anterior con <code>replicas: 0</code> — vacío pero presente. Esto es a propósito: permite hacer <code>kubectl rollout undo</code> y revivirlo. <code>kubectl get rs</code> te mostrará algo como:</p>

      <pre><code>NAME                 DESIRED   CURRENT   READY   AGE
web-7c9f8c4d         0         0         0       2d
web-9b8a7e6f         3         3         3       5h</code></pre>

      <p>El primero es un ReplicaSet "viejo" del Deployment <code>web</code>. No está muerto, está dormido por si lo necesitas para un rollback. Limpiarlos a mano puede romper el historial de revisiones del Deployment — vale la pena dejarlos.</p>

      <h2>Para la KCNA</h2>

      <ul>
        <li>Un ReplicaSet mantiene N Pods que matcheen su selector. Nada más.</li>
        <li>El campo <code>spec.template.metadata.labels</code> tiene que matchear <code>spec.selector.matchLabels</code>.</li>
        <li>Cualquier Pod que matchee el selector queda adoptado.</li>
        <li>Cambiar la imagen del template <em>no</em> rota Pods existentes.</li>
        <li>En la práctica, los Deployment crean ReplicaSets — tú casi nunca los escribes a mano.</li>
      </ul>

      <p>En la siguiente sub-parte vemos al Deployment en acción: cómo añade versiones, cómo orquesta el rolling update, y cuál es la cadena completa Deployment → ReplicaSet → Pod.</p>
    `,
  en: `
      <p>Let's start with the ReplicaSet. It's the simpler of the two pieces, and everything the Deployment does later sits on top of it. If you understand ReplicaSet, Deployment becomes "ReplicaSet with version superpowers".</p>

      <h2>What it does, exactly</h2>

      <p>A <code>ReplicaSet</code> has a one-line job: <strong>make sure there are always <em>N</em> Pods matching its selector</strong>. Where <em>N</em> is the <code>replicas</code> field and the <em>selector</em> is a set of labels.</p>

      <p>Its reconciliation loop, in pseudocode:</p>

      <pre><code>while True:
    pods = api.list_pods(matching=selector)
    actual = len([p for p in pods if not p.deletionTimestamp])
    if actual < replicas:
        api.create_pod(template)
    elif actual > replicas:
        api.delete_pod(pick_one(pods))</code></pre>

      <p class="source-note">Illustrative pseudocode. The real implementation lives in <a href="https://github.com/kubernetes/kubernetes/blob/master/pkg/controller/replicaset/" target="_blank" rel="noopener noreferrer">kubernetes/pkg/controller/replicaset</a>.</p>

      <p>That's it. It doesn't update images, doesn't rotate versions, doesn't do rolling updates. Just counts and fills the gap.</p>

      <h2>ReplicaSet anatomy</h2>

      <pre><code>apiVersion: apps/v1
kind: ReplicaSet
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web         # Pods created by the RS must match the selector
    spec:
      containers:
        - name: nginx
          image: nginx:1.27</code></pre>

      <p>The three key fields:</p>

      <ul>
        <li><strong><code>replicas</code></strong>: how many Pods you want.</li>
        <li><strong><code>selector</code></strong>: which Pods count as the RS's. Any Pod in the namespace whose labels match the selector "belongs" to the ReplicaSet.</li>
        <li><strong><code>template</code></strong>: the Pod spec that gets created when replicas are missing. The template's labels must match the selector — otherwise newly created Pods don't count, and the RS keeps making them forever. One of the classic mistakes.</li>
      </ul>

      <h2>Adoption of stray Pods</h2>

      <p>A weird but real property: if you create a Pod manually whose labels match an existing ReplicaSet's selector, that Pod gets <em>adopted</em>. The RS counts it as its own. If <code>replicas</code> was already satisfied, the RS will kill one (maybe yours, maybe another). If it was short, it counts the new one and stops creating more.</p>

      <p>Worth knowing to diagnose mysteries like <em>"I created a Pod and it just disappeared"</em>. The explanation is usually: some label matches an existing selector.</p>

      <h2>Why almost nobody creates them by hand</h2>

      <p>A ReplicaSet on its own gives you <em>self-healing</em> and <em>horizontal scaling</em> — but not rolling updates. If you change <code>spec.template.spec.containers[0].image</code> on an existing ReplicaSet:</p>

      <ul>
        <li>Pods already running <strong>are not updated</strong>. They keep the old image.</li>
        <li>Only Pods the RS creates <em>after</em> the change use the new image.</li>
      </ul>

      <p>To force an update you'd have to kill Pods one by one and let the RS recreate them. It's manual, error-prone, and gives you no rollback. That's why Deployment exists.</p>

      <h2>When you see an "orphan" ReplicaSet</h2>

      <p>Every time a Deployment does a rolling update, it leaves the previous ReplicaSet behind with <code>replicas: 0</code> — empty but present. This is on purpose: it lets you <code>kubectl rollout undo</code> and revive it. <code>kubectl get rs</code> will show something like:</p>

      <pre><code>NAME                 DESIRED   CURRENT   READY   AGE
web-7c9f8c4d         0         0         0       2d
web-9b8a7e6f         3         3         3       5h</code></pre>

      <p>The first one is an "old" ReplicaSet from the <code>web</code> Deployment. It's not dead — it's asleep, in case you need it for a rollback. Cleaning these by hand can break the Deployment's revision history; let them be.</p>

      <h2>For the KCNA</h2>

      <ul>
        <li>A ReplicaSet keeps N Pods matching its selector. Nothing more.</li>
        <li><code>spec.template.metadata.labels</code> must match <code>spec.selector.matchLabels</code>.</li>
        <li>Any Pod that matches the selector gets adopted.</li>
        <li>Changing the template's image does <em>not</em> rotate existing Pods.</li>
        <li>In practice, Deployments create ReplicaSets — you almost never write them by hand.</li>
      </ul>

      <p>In the next sub-part we see the Deployment in action: how it adds versions, how it orchestrates the rolling update, and the full chain Deployment → ReplicaSet → Pod.</p>
    `,
};
