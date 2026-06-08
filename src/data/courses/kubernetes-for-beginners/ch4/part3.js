export default {
  es: `
      <p>El <code>Deployment</code> es la abstracción que envuelve al ReplicaSet y le añade lo que el ReplicaSet no sabe hacer: <strong>actualizar</strong> los Pods sin downtime y <strong>recordar</strong> versiones anteriores para poder volver atrás.</p>

      <h2>La cadena Deployment → ReplicaSet → Pod</h2>

      <p>Cuando aplicas un Deployment, lo que pasa por debajo es:</p>

      <ol>
        <li>El controller de Deployment crea un <code>ReplicaSet</code> con la spec del template actual.</li>
        <li>Ese ReplicaSet, a su vez, crea los <code>Pods</code> declarados en su template.</li>
      </ol>

      <p>Tres niveles. Tú interactúas con el Deployment; el Deployment interactúa con su ReplicaSet; el ReplicaSet interactúa con los Pods. Cada nivel hace una cosa específica.</p>

      <h2>Anatomía del Deployment</h2>

      <pre><code>apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: nginx
          image: nginx:1.27
          ports:
            - containerPort: 80
          readinessProbe:
            httpGet:
              path: /
              port: 80</code></pre>

      <p>Si comparas con el ReplicaSet de la sub-parte anterior, vas a ver que casi todo es lo mismo — <code>replicas</code>, <code>selector</code>, <code>template</code>. Lo nuevo es <code>strategy</code>, que es donde vive la magia del rolling update.</p>

      <h2>strategy: cómo se actualizan los Pods</h2>

      <p>Hay dos estrategias built-in:</p>

      <ul>
        <li><strong><code>RollingUpdate</code></strong> (default): mata Pods viejos y crea nuevos en paralelo, manteniendo el servicio disponible durante la transición. Lo cubrimos a fondo en el <a href="/course/kubernetes-for-beginners/rolling-updates">capítulo 11</a>.</li>
        <li><strong><code>Recreate</code></strong>: mata <em>todos</em> los Pods viejos primero, luego crea los nuevos. Hay downtime garantizado, pero asegura que nunca corren las dos versiones al mismo tiempo. Útil para apps que no toleran ese cruce.</li>
      </ul>

      <p>Los dos parámetros del rolling update:</p>

      <ul>
        <li><strong><code>maxSurge</code></strong>: cuántos Pods <em>extra</em> sobre el total se permiten temporalmente. Si <code>replicas: 3</code> y <code>maxSurge: 1</code>, durante la rotación puede haber hasta 4 Pods.</li>
        <li><strong><code>maxUnavailable</code></strong>: cuántos Pods <em>menos</em> del total se permiten. Con <code>maxUnavailable: 0</code> nunca bajas de la cantidad declarada.</li>
      </ul>

      <p>La combinación que se usa más en producción es <code>maxSurge: 1, maxUnavailable: 0</code>: nunca pierdes capacidad, a cambio de necesitar un poco más de cluster durante el rollout.</p>

      <h2>Qué pasa cuando cambias la imagen</h2>

      <p>Supongamos que tienes el Deployment <code>web</code> corriendo con <code>nginx:1.27</code> y haces:</p>

      <pre><code>kubectl set image deployment/web nginx=nginx:1.28</code></pre>

      <p>El controller de Deployment:</p>

      <ol>
        <li>Genera un hash del nuevo template. Como cambió la imagen, el hash es distinto.</li>
        <li>Busca un ReplicaSet con ese hash. No existe → crea uno nuevo (el "RS nuevo") con <code>replicas: 0</code>.</li>
        <li>Empieza a alternar: incrementa <code>replicas</code> en el RS nuevo (que pulla la imagen 1.28 y arranca un Pod), y cuando el Pod nuevo está <em>Ready</em>, decrementa <code>replicas</code> en el RS viejo (que mata uno de los Pods 1.27).</li>
        <li>Repite hasta que el RS nuevo tenga 3 réplicas y el viejo tenga 0.</li>
      </ol>

      <p>El RS viejo no se borra — se queda con <code>replicas: 0</code>, listo para un <code>kubectl rollout undo</code> si haces falta. Para ver la cadena en vivo:</p>

      <pre><code>kubectl rollout status deployment/web
kubectl get rs -l app=web
kubectl get pods -l app=web -w</code></pre>

      <h2>Por qué importan los probes durante el rollout</h2>

      <p>El paso "y cuando el Pod nuevo está Ready" del flujo anterior depende de la <code>readinessProbe</code> del Pod. Si tu app tarda 30 segundos en arrancar y no tienes readiness probe:</p>

      <ul>
        <li>Kubernetes considera al Pod listo apenas el contenedor pasa de Pending a Running.</li>
        <li>Empieza a recibir tráfico antes de estar lista de verdad.</li>
        <li>Los usuarios ven errores durante el rollout.</li>
      </ul>

      <p>Con readiness probe configurada, el Deployment espera a que cada Pod nuevo responda OK antes de seguir rotando. Por eso el manifest de ejemplo arriba tiene una.</p>

      <h2>Para la KCNA</h2>

      <ul>
        <li>Un Deployment crea ReplicaSets, los ReplicaSets crean Pods.</li>
        <li>Cambiar el template del Deployment crea un nuevo ReplicaSet; el viejo queda con replicas=0.</li>
        <li>Estrategias: <code>RollingUpdate</code> (default, sin downtime) o <code>Recreate</code> (mata todo primero).</li>
        <li><code>maxSurge</code> = Pods extra permitidos durante el rollout. <code>maxUnavailable</code> = Pods menos permitidos.</li>
        <li>Sin readiness probe, el rollout puede causar downtime aunque sea "rolling".</li>
      </ul>

      <p>Con esto vimos la mecánica. En la siguiente sub-parte abrimos el otro pegamento del modelo: las labels y los selectors. Sin ellas, ni Deployment, ni Service, ni nada.</p>
    `,
  en: `
      <p>The <code>Deployment</code> is the abstraction that wraps around a ReplicaSet and adds what ReplicaSet can't do: <strong>update</strong> Pods without downtime and <strong>remember</strong> previous versions so you can roll back.</p>

      <h2>The chain Deployment → ReplicaSet → Pod</h2>

      <p>When you apply a Deployment, what happens underneath:</p>

      <ol>
        <li>The Deployment controller creates a <code>ReplicaSet</code> with the current template's spec.</li>
        <li>That ReplicaSet, in turn, creates the <code>Pods</code> declared in its template.</li>
      </ol>

      <p>Three levels. You interact with the Deployment; the Deployment interacts with its ReplicaSet; the ReplicaSet interacts with the Pods. Each level does one specific thing.</p>

      <h2>Deployment anatomy</h2>

      <pre><code>apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: nginx
          image: nginx:1.27
          ports:
            - containerPort: 80
          readinessProbe:
            httpGet:
              path: /
              port: 80</code></pre>

      <p>If you compare this to the ReplicaSet from the previous sub-part, you'll see almost everything is the same — <code>replicas</code>, <code>selector</code>, <code>template</code>. What's new is <code>strategy</code>, where the rolling-update magic lives.</p>

      <h2>strategy: how Pods get updated</h2>

      <p>There are two built-in strategies:</p>

      <ul>
        <li><strong><code>RollingUpdate</code></strong> (default): kills old Pods and creates new ones in parallel, keeping the service available during the transition. Covered in depth in <a href="/course/kubernetes-for-beginners/rolling-updates">chapter 11</a>.</li>
        <li><strong><code>Recreate</code></strong>: kills <em>all</em> old Pods first, then creates the new ones. Guaranteed downtime, but ensures the two versions never run at the same time. Useful for apps that can't tolerate that overlap.</li>
      </ul>

      <p>The two rolling-update knobs:</p>

      <ul>
        <li><strong><code>maxSurge</code></strong>: how many Pods <em>above</em> the total can exist temporarily. With <code>replicas: 3</code> and <code>maxSurge: 1</code>, you can have up to 4 Pods during the rotation.</li>
        <li><strong><code>maxUnavailable</code></strong>: how many Pods <em>below</em> the total can exist. With <code>maxUnavailable: 0</code> you never drop below the declared count.</li>
      </ul>

      <p>The most common production combination is <code>maxSurge: 1, maxUnavailable: 0</code>: you never lose capacity, in exchange for needing a little extra cluster during the rollout.</p>

      <h2>What happens when you change the image</h2>

      <p>Say you have the <code>web</code> Deployment running <code>nginx:1.27</code> and you do:</p>

      <pre><code>kubectl set image deployment/web nginx=nginx:1.28</code></pre>

      <p>The Deployment controller:</p>

      <ol>
        <li>Hashes the new template. Image changed → different hash.</li>
        <li>Looks for a ReplicaSet with that hash. Doesn't exist → creates a new one (the "new RS") with <code>replicas: 0</code>.</li>
        <li>Starts alternating: increments <code>replicas</code> on the new RS (which pulls 1.28 and starts a Pod), and once the new Pod is <em>Ready</em>, decrements <code>replicas</code> on the old RS (which kills one of the 1.27 Pods).</li>
        <li>Repeats until the new RS has 3 replicas and the old has 0.</li>
      </ol>

      <p>The old RS isn't deleted — it stays with <code>replicas: 0</code>, ready for a <code>kubectl rollout undo</code> if needed. To watch the chain live:</p>

      <pre><code>kubectl rollout status deployment/web
kubectl get rs -l app=web
kubectl get pods -l app=web -w</code></pre>

      <h2>Why probes matter during the rollout</h2>

      <p>The "and once the new Pod is Ready" step above depends on the Pod's <code>readinessProbe</code>. If your app takes 30 seconds to start and you have no readiness probe:</p>

      <ul>
        <li>Kubernetes considers the Pod ready as soon as the container moves from Pending to Running.</li>
        <li>It starts receiving traffic before it's actually ready.</li>
        <li>Users see errors during the rollout.</li>
      </ul>

      <p>With a readiness probe configured, the Deployment waits for each new Pod to respond OK before continuing. That's why the example manifest above has one.</p>

      <h2>For the KCNA</h2>

      <ul>
        <li>A Deployment creates ReplicaSets; ReplicaSets create Pods.</li>
        <li>Changing the Deployment's template creates a new ReplicaSet; the old one stays at replicas=0.</li>
        <li>Strategies: <code>RollingUpdate</code> (default, no downtime) or <code>Recreate</code> (kill all first).</li>
        <li><code>maxSurge</code> = extra Pods allowed during rollout. <code>maxUnavailable</code> = how few Pods allowed.</li>
        <li>Without a readiness probe, the rollout can cause downtime even though it's "rolling".</li>
      </ul>

      <p>That covers the mechanics. In the next sub-part we open the model's other piece of glue: labels and selectors. Without them, Deployment, Service, none of it works.</p>
    `,
}
