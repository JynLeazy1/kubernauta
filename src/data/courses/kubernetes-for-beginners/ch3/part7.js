export default {
  es: `
      <p>En producción casi nunca vas a crear un <code>kind: Pod</code> a mano. Lo dijimos en la <a href="/course/kubernetes-for-beginners/pods/introduccion">introducción del capítulo</a>: los Pods son efímeros, se mueren, y nadie viene a resucitarlos por su cuenta. La inteligencia que los crea, los vigila y los reemplaza vive un nivel más arriba — en los <em>controllers de carga de trabajo</em> (workload controllers).</p>

      <p>Cada uno está diseñado para un patrón de uso distinto. Vale la pena conocerlos los seis aunque después solo uses tres todos los días.</p>

      <h2>ReplicaSet y Deployment</h2>

      <p>El par más común. Un <code>Deployment</code> es lo que usas el 95% del tiempo cuando tu carga es <em>stateless</em>: una API HTTP, un worker que procesa cola, un frontend.</p>

      <ul>
        <li>Declaras cuántas réplicas quieres del Pod (<code>replicas: 3</code>).</li>
        <li>El Deployment crea por debajo un <code>ReplicaSet</code>, que es quien realmente vigila los N Pods.</li>
        <li>Cuando cambias la imagen, el Deployment crea un nuevo ReplicaSet y rota Pods entre el viejo y el nuevo (rolling update).</li>
        <li>Si un Pod muere, otro arranca para mantener N. Si el nodo cae, el scheduler reubica los Pods perdidos en otro lado.</li>
      </ul>

      <p>Los detalles los abrimos en el <a href="/course/kubernetes-for-beginners/replicasets-and-deployments">capítulo 4</a> y la mecánica del rollout en el <a href="/course/kubernetes-for-beginners/rolling-updates">capítulo 11</a>.</p>

      <h2>StatefulSet</h2>

      <p>Cuando tu carga necesita <strong>identidad estable</strong> y <strong>almacenamiento persistente por réplica</strong>: bases de datos (PostgreSQL, Cassandra, MongoDB), brokers de mensajes (Kafka, RabbitMQ), sistemas de quorum (etcd, ZooKeeper).</p>

      <ul>
        <li>Los Pods se llaman <code>db-0</code>, <code>db-1</code>, <code>db-2</code> — nombre estable, no aleatorio.</li>
        <li>Cada Pod recibe su propio <code>PersistentVolumeClaim</code> que lo sigue si se reinicia.</li>
        <li>Arrancan en orden (0 antes que 1, 1 antes que 2) y terminan en orden inverso. Crítico para clusters que necesitan elegir líder.</li>
      </ul>

      <p>Lo cubrimos en el <a href="/course/kubernetes-for-beginners/statefulsets-daemonsets-jobs">capítulo 13</a>.</p>

      <h2>DaemonSet</h2>

      <p>Garantiza que <strong>haya exactamente una réplica del Pod en cada nodo</strong> del cluster (o en un subconjunto, vía <code>nodeSelector</code>).</p>

      <p>Casos típicos:</p>

      <ul>
        <li>Agentes de logging (fluent-bit, vector) que recolectan logs locales.</li>
        <li>Agentes de métricas (node-exporter de Prometheus).</li>
        <li>Componentes de red del cluster: Cilium, Calico, kube-proxy.</li>
      </ul>

      <p>Cuando un nodo se une al cluster, el DaemonSet crea ahí su Pod automáticamente. Cuando un nodo se quita, el Pod se va con él.</p>

      <h2>Job</h2>

      <p>Un <code>Job</code> ejecuta un Pod (o varios) que <strong>termina</strong>: una migración, un import de datos, un compute batch. A diferencia de Deployment, el Job se considera "completado" cuando los Pods exiten 0.</p>

      <pre><code>apiVersion: batch/v1
kind: Job
metadata:
  name: db-migrate
spec:
  backoffLimit: 4
  template:
    spec:
      restartPolicy: OnFailure
      containers:
        - name: migrate
          image: myapp-migrations:1.0</code></pre>

      <p>El <code>backoffLimit</code> dice cuántos reintentos en caso de fallo. <code>restartPolicy: OnFailure</code> permite reintentar dentro del mismo Pod sin recrearlo. Hay variantes para correr <em>en paralelo</em> (<code>parallelism</code>) o procesar una cola con <code>completions</code>.</p>

      <h2>CronJob</h2>

      <p>Un <code>Job</code> programado en el tiempo. La spec es la misma, envuelta en un schedule cron:</p>

      <pre><code>apiVersion: batch/v1
kind: CronJob
metadata:
  name: nightly-backup
spec:
  schedule: "0 2 * * *"          # 02:00 UTC todos los días
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: backup
              image: myapp-backup:1.0</code></pre>

      <p>El controller de CronJob crea un nuevo Job cada vez que toca disparar. Detalles importantes para producción: <code>concurrencyPolicy</code> (qué hacer si el anterior aún corre), <code>startingDeadlineSeconds</code>, y <code>successfulJobsHistoryLimit</code> para no acumular Jobs viejos en etcd.</p>

      <h2>Pod "a pelo": cuándo sí</h2>

      <p>Hay tres casos legítimos para crear un Pod sin controller:</p>

      <ul>
        <li><strong>Pruebas locales</strong> con <code>kubectl run</code> o <code>kubectl debug</code>: nadie va a reiniciar nada, lo borras tú al terminar.</li>
        <li><strong>Static Pods</strong>: definidos como archivos en <code>/etc/kubernetes/manifests/</code> de un nodo, kubelet los crea sin pasar por el apiserver. Así corren los componentes del control plane en clusters con <code>kubeadm</code>.</li>
        <li><strong>Aprendiendo Kubernetes</strong>: el primer YAML del primer tutorial que abres es un Pod. Está bien.</li>
      </ul>

      <p>Fuera de eso, si te encuentras escribiendo <code>kind: Pod</code> en producción, detente y pregúntate qué controller debería estar gestionándolo.</p>

      <h2>Cómo elegir</h2>

      <p>Una pregunta rápida casi siempre acierta: <em>"¿qué tipo de carga es?"</em>.</p>

      <ul>
        <li>Stateless, varias réplicas idénticas → <strong>Deployment</strong>.</li>
        <li>Stateful, identidad estable por réplica → <strong>StatefulSet</strong>.</li>
        <li>Una réplica por nodo → <strong>DaemonSet</strong>.</li>
        <li>Tarea que termina → <strong>Job</strong>.</li>
        <li>Tarea recurrente programada → <strong>CronJob</strong>.</li>
      </ul>

      <h2>Para la KCNA</h2>

      <ul>
        <li>Pod = unidad mínima; nunca lo creas a mano en producción.</li>
        <li>Deployment / ReplicaSet → stateless, N réplicas idénticas.</li>
        <li>StatefulSet → identidad estable + almacenamiento por réplica.</li>
        <li>DaemonSet → uno por nodo.</li>
        <li>Job → una sola corrida; CronJob → corridas programadas.</li>
        <li>Static Pod → definido en disco del nodo, sin apiserver. Así corren los componentes de control plane con kubeadm.</li>
      </ul>

      <p>En la siguiente sub-parte cerramos el capítulo con el resumen del Pod y entregamos la posta al <a href="/course/kubernetes-for-beginners/replicasets-and-deployments">capítulo 4 (ReplicaSets y Deployments)</a>.</p>
    `,
  en: `
      <p>In production you'll almost never create a <code>kind: Pod</code> by hand. We said it in the <a href="/course/kubernetes-for-beginners/pods/introduccion">chapter intro</a>: Pods are ephemeral, they die, and nobody comes to revive them on their own. The intelligence that creates, watches, and replaces them lives one level up — in the <em>workload controllers</em>.</p>

      <p>Each one is built for a different usage pattern. Worth knowing all six even if you only use three day-to-day.</p>

      <h2>ReplicaSet and Deployment</h2>

      <p>The most common pair. A <code>Deployment</code> is what you use 95% of the time when your workload is <em>stateless</em>: an HTTP API, a queue worker, a frontend.</p>

      <ul>
        <li>You declare how many replicas you want of the Pod (<code>replicas: 3</code>).</li>
        <li>The Deployment creates a <code>ReplicaSet</code> underneath, which is what actually watches the N Pods.</li>
        <li>When you change the image, the Deployment creates a new ReplicaSet and rotates Pods between old and new (rolling update).</li>
        <li>If a Pod dies, another starts to maintain N. If the node fails, the scheduler reschedules the lost Pods elsewhere.</li>
      </ul>

      <p>Details come in <a href="/course/kubernetes-for-beginners/replicasets-and-deployments">chapter 4</a> and the rollout mechanics in <a href="/course/kubernetes-for-beginners/rolling-updates">chapter 11</a>.</p>

      <h2>StatefulSet</h2>

      <p>For workloads that need <strong>stable identity</strong> and <strong>per-replica persistent storage</strong>: databases (PostgreSQL, Cassandra, MongoDB), message brokers (Kafka, RabbitMQ), quorum systems (etcd, ZooKeeper).</p>

      <ul>
        <li>Pods are named <code>db-0</code>, <code>db-1</code>, <code>db-2</code> — stable, not random.</li>
        <li>Each Pod gets its own <code>PersistentVolumeClaim</code> that follows it across restarts.</li>
        <li>They start in order (0 before 1, 1 before 2) and shut down in reverse. Critical for clusters that elect a leader.</li>
      </ul>

      <p>Covered in <a href="/course/kubernetes-for-beginners/statefulsets-daemonsets-jobs">chapter 13</a>.</p>

      <h2>DaemonSet</h2>

      <p>Guarantees <strong>exactly one replica of the Pod per node</strong> in the cluster (or on a subset, via <code>nodeSelector</code>).</p>

      <p>Typical cases:</p>

      <ul>
        <li>Logging agents (fluent-bit, vector) collecting local logs.</li>
        <li>Metrics agents (Prometheus's node-exporter).</li>
        <li>Cluster network components: Cilium, Calico, kube-proxy.</li>
      </ul>

      <p>When a node joins the cluster, the DaemonSet creates its Pod there automatically. When a node leaves, the Pod leaves with it.</p>

      <h2>Job</h2>

      <p>A <code>Job</code> runs a Pod (or several) that <strong>finishes</strong>: a migration, a data import, a batch compute. Unlike Deployment, the Job is considered "complete" when the Pods exit 0.</p>

      <pre><code>apiVersion: batch/v1
kind: Job
metadata:
  name: db-migrate
spec:
  backoffLimit: 4
  template:
    spec:
      restartPolicy: OnFailure
      containers:
        - name: migrate
          image: myapp-migrations:1.0</code></pre>

      <p><code>backoffLimit</code> says how many retries on failure. <code>restartPolicy: OnFailure</code> allows retries within the same Pod without recreating it. There are variants for running <em>in parallel</em> (<code>parallelism</code>) or processing a queue with <code>completions</code>.</p>

      <h2>CronJob</h2>

      <p>A <code>Job</code> on a schedule. Same spec, wrapped in a cron:</p>

      <pre><code>apiVersion: batch/v1
kind: CronJob
metadata:
  name: nightly-backup
spec:
  schedule: "0 2 * * *"          # 02:00 UTC every day
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: backup
              image: myapp-backup:1.0</code></pre>

      <p>The CronJob controller creates a new Job each time the schedule fires. Production-relevant fields: <code>concurrencyPolicy</code> (what to do if the previous run is still going), <code>startingDeadlineSeconds</code>, and <code>successfulJobsHistoryLimit</code> to avoid piling up old Jobs in etcd.</p>

      <h2>Pod by hand: when it's OK</h2>

      <p>Three legitimate cases to create a Pod without a controller:</p>

      <ul>
        <li><strong>Local tests</strong> with <code>kubectl run</code> or <code>kubectl debug</code>: nobody is going to restart anything, you delete it when done.</li>
        <li><strong>Static Pods</strong>: defined as files under <code>/etc/kubernetes/manifests/</code> on a node, kubelet creates them without going through the apiserver. That's how the control plane components run on <code>kubeadm</code> clusters.</li>
        <li><strong>Learning Kubernetes</strong>: the first YAML in the first tutorial you open is a Pod. That's fine.</li>
      </ul>

      <p>Outside of that, if you find yourself writing <code>kind: Pod</code> in production, stop and ask which controller should be managing it.</p>

      <h2>How to choose</h2>

      <p>A quick question almost always nails it: <em>"what kind of workload is this?"</em>.</p>

      <ul>
        <li>Stateless, several identical replicas → <strong>Deployment</strong>.</li>
        <li>Stateful, stable per-replica identity → <strong>StatefulSet</strong>.</li>
        <li>One replica per node → <strong>DaemonSet</strong>.</li>
        <li>Task that finishes → <strong>Job</strong>.</li>
        <li>Recurring scheduled task → <strong>CronJob</strong>.</li>
      </ul>

      <h2>For the KCNA</h2>

      <ul>
        <li>Pod = minimum unit; you never create it by hand in production.</li>
        <li>Deployment / ReplicaSet → stateless, N identical replicas.</li>
        <li>StatefulSet → stable identity + per-replica storage.</li>
        <li>DaemonSet → one per node.</li>
        <li>Job → one-shot run; CronJob → scheduled runs.</li>
        <li>Static Pod → defined on the node's disk, no apiserver involved. That's how kubeadm runs control plane components.</li>
      </ul>

      <p>In the next sub-part we close the chapter with the Pod recap and hand off to <a href="/course/kubernetes-for-beginners/replicasets-and-deployments">chapter 4 (ReplicaSets and Deployments)</a>.</p>
    `,
};
