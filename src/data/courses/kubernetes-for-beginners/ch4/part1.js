export default {
  es: `
      <p>El <a href="/course/kubernetes-for-beginners/pods">capítulo anterior</a> cerró con una frase clave: en producción, los Pods los crea y los vigila un <em>controller</em>. Toca abrir el más usado de todos: el <code>Deployment</code>. Y para entenderlo, hay que ver primero su pieza interna, el <code>ReplicaSet</code>.</p>

      <h2>El problema que resuelven</h2>

      <p>Imaginá que pones un Pod en un cluster: <code>kubectl apply -f mi-app.yaml</code>. Funciona, sirve tráfico, todo bien. ¿Qué pasa si:</p>

      <ul>
        <li>El nodo donde corre se cae?</li>
        <li>El proceso de la app crashea?</li>
        <li>Necesitas pasar de 1 réplica a 10?</li>
        <li>Tienes que actualizar la imagen sin downtime?</li>
        <li>Te equivocaste con la versión y quieres regresarte?</li>
      </ul>

      <p>La respuesta corta: el Pod por sí solo <em>no</em> resuelve nada de eso. El que resuelve es el <code>Deployment</code>, apoyándose en su brazo derecho, el <code>ReplicaSet</code>.</p>

      <h2>La pareja: ReplicaSet y Deployment</h2>

      <p>Resumido en dos frases:</p>

      <ul>
        <li><strong>ReplicaSet</strong>: un controller cuya única tarea es <em>"siempre hay exactamente N Pods que matchean este selector"</em>. Si hay menos, crea. Si hay más, mata.</li>
        <li><strong>Deployment</strong>: una capa por encima del ReplicaSet que añade <em>versiones</em>: cada cambio crea un nuevo ReplicaSet y migra Pods entre el viejo y el nuevo. Lo que llamamos <em>rolling update</em>.</li>
      </ul>

      <p>Casi nadie crea ReplicaSets directamente — los gestiona el Deployment por debajo. Pero conviene conocer la pieza, porque cuando algo falla y haces <code>kubectl get rs</code>, te encuentras con dos o tres ReplicaSets que el Deployment fue dejando atrás. Saber qué son evita pánico.</p>

      <h2>Lo que vamos a ver en este capítulo</h2>

      <ol>
        <li><strong>ReplicaSet</strong>: cómo funciona el loop "mantén N réplicas" desde adentro.</li>
        <li><strong>Deployment</strong>: la capa de versiones encima del ReplicaSet, con su YAML típico.</li>
        <li><strong>Labels y selectors</strong>: el pegamento del modelo. Sin esto, nada de lo demás funciona.</li>
        <li><strong>Escalar y actualizar</strong>: comandos del día a día (<code>kubectl scale</code>, <code>kubectl set image</code>).</li>
        <li><strong>Rollback</strong>: cómo se vuelve atrás cuando una versión sale mal.</li>
      </ol>

      <p>Al terminar, vas a poder leer un Deployment manifest, explicar qué pasa cuando aplicas un cambio, y saber exactamente cómo recuperar el cluster cuando una imagen rota llega a producción. Que pasa más seguido de lo que crees.</p>
    `,
  en: `
      <p>The <a href="/course/kubernetes-for-beginners/pods">previous chapter</a> closed with a key line: in production, Pods are created and watched by a <em>controller</em>. Time to open the most-used one of all: the <code>Deployment</code>. And to understand it, we first need to see its internal piece, the <code>ReplicaSet</code>.</p>

      <h2>The problem they solve</h2>

      <p>Picture this: you put a Pod in a cluster with <code>kubectl apply -f my-app.yaml</code>. It works, serves traffic, all good. What happens when:</p>

      <ul>
        <li>The node where it runs goes down?</li>
        <li>The app's process crashes?</li>
        <li>You need to go from 1 replica to 10?</li>
        <li>You have to update the image with no downtime?</li>
        <li>You shipped the wrong version and need to roll back?</li>
      </ul>

      <p>Short answer: the Pod alone solves <em>none</em> of that. What solves it is the <code>Deployment</code>, leaning on its right hand, the <code>ReplicaSet</code>.</p>

      <h2>The pair: ReplicaSet and Deployment</h2>

      <p>Two-line summary:</p>

      <ul>
        <li><strong>ReplicaSet</strong>: a controller whose single job is <em>"there are always exactly N Pods matching this selector"</em>. Fewer? It creates. More? It deletes.</li>
        <li><strong>Deployment</strong>: a layer on top of ReplicaSet that adds <em>versions</em>: each change creates a new ReplicaSet and migrates Pods between the old and new ones. What we call a <em>rolling update</em>.</li>
      </ul>

      <p>Almost nobody creates ReplicaSets directly — the Deployment manages them underneath. But it's worth knowing the piece, because when something fails and you run <code>kubectl get rs</code>, you'll see two or three ReplicaSets the Deployment left behind. Knowing what they are prevents panic.</p>

      <h2>What we'll cover</h2>

      <ol>
        <li><strong>ReplicaSet</strong>: how the "keep N replicas" loop works from the inside.</li>
        <li><strong>Deployment</strong>: the version layer on top of ReplicaSet, with its typical YAML.</li>
        <li><strong>Labels and selectors</strong>: the model's glue. Without this, nothing else works.</li>
        <li><strong>Scale and update</strong>: day-to-day commands (<code>kubectl scale</code>, <code>kubectl set image</code>).</li>
        <li><strong>Rollback</strong>: how to revert when a version goes bad.</li>
      </ol>

      <p>By the end, you'll be able to read a Deployment manifest, explain what happens when you apply a change, and know exactly how to recover the cluster when a broken image lands in production. Which happens more often than you think.</p>
    `,
}
