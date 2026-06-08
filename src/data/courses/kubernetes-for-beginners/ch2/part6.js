export default {
  es: `
      <p>Hasta aquí hemos hablado del modelo declarativo desde la óptica del cluster. Ahora miramos el otro lado: el tuyo, el del cliente. Cuando escribes <code>kubectl apply -f deploy.yaml</code>, ¿qué hace exactamente esa herramienta? ¿Cuándo usar <code>apply</code> vs <code>create</code> vs <code>replace</code>? ¿Y qué demonios es <em>server-side apply</em>?</p>

      <p>Entender esto no es detalle trivial: es lo que separa usar Kubernetes <em>imperativamente</em> (cada comando es una acción) de usarlo <em>declarativamente</em> de verdad (cada <code>apply</code> es una re-declaración del estado deseado).</p>

      <h2>kubectl es un cliente HTTP</h2>

      <p>Vale la pena repetirlo: <code>kubectl</code> no tiene magia. Es un cliente REST que habla con el <code>kube-apiserver</code>. Cada comando se traduce a una llamada HTTP. Puedes verlo con:</p>

      <pre><code>kubectl apply -f deploy.yaml -v=8 2>&1 | grep -E "GET|POST|PATCH|PUT"</code></pre>

      <p>Verás que un <code>apply</code> suele traducirse a un <code>GET</code> (para ver si el objeto existe) seguido de un <code>PATCH</code> (con los cambios). Un <code>create</code> es un <code>POST</code>. Un <code>delete</code>, un <code>DELETE</code>. Así de directo.</p>

      <h2>apply vs create vs replace</h2>

      <p>Los tres cambian el estado del cluster, pero con semánticas distintas:</p>

      <ul>
        <li><strong><code>create</code></strong> — <em>"crea este objeto nuevo. Si ya existe, falla."</em> Es imperativo: asume que no había nada antes.</li>
        <li><strong><code>replace</code></strong> — <em>"reemplaza este objeto por el que te doy. Si no existe, falla (a menos que uses <code>--force</code>)."</em> También imperativo: requiere el objeto previo para funcionar idempotentemente.</li>
        <li><strong><code>apply</code></strong> — <em>"haz que el cluster coincida con este YAML. Si el objeto no existe, créalo. Si existe, actualízalo, respetando los campos que otros clientes hayan tocado."</em> Es el único realmente declarativo.</li>
      </ul>

      <p><code>apply</code> es el que deberías usar el 99% del tiempo. <code>create</code> y <code>replace</code> están ahí por compatibilidad y scripts viejos, pero no son el modo nativo del sistema.</p>

      <h2>Client-side apply: cómo funcionaba originalmente</h2>

      <p>La implementación histórica de <code>apply</code> vive en el cliente. El flujo es:</p>

      <ol>
        <li><code>kubectl</code> guarda tu YAML como una annotation (<code>kubectl.kubernetes.io/last-applied-configuration</code>) en el objeto.</li>
        <li>La próxima vez que aplicas, calcula un <em>diff</em> entre: tu YAML actual, la last-applied-configuration guardada, y el estado vivo del objeto.</li>
        <li>Construye un <em>strategic merge patch</em> y lo envía al apiserver.</li>
      </ol>

      <p>Funciona, pero tiene problemas serios cuando varios "clientes" (humanos, Argo CD, Helm, operators) tocan el mismo objeto. Cada uno tenía su propia última configuración guardada y se pisaban los cambios sin saberlo.</p>

      <h2>Server-side apply: la evolución</h2>

      <p>Para resolver eso, Kubernetes introdujo <strong>server-side apply</strong> (SSA), estable desde 1.22. La diferencia: el diff y el merge los hace el apiserver, no el cliente.</p>

      <p>La idea clave es <em>field ownership</em>. Cada campo de un objeto tiene dueño — el último cliente que lo escribió. Cuando otro cliente intenta cambiar un campo del que no es dueño, hay un conflicto explícito. Tú decides si hacer <code>--force-conflicts</code> (tomar la propiedad) o ajustar tu manifest.</p>

      <p>Ejemplo:</p>

      <pre><code>kubectl apply --server-side -f deploy.yaml</code></pre>

      <p>Si un operator ya había escrito <code>spec.replicas</code> (porque gestiona autoscaling) y tú aplicas un YAML con <code>replicas: 3</code>, el apiserver te va a decir: <em>"hay un conflicto en spec.replicas, cuyo dueño es <code>hpa-controller</code>"</em>. No se sobrescribe a ciegas.</p>

      <p>Esto importa mucho en entornos complejos donde GitOps y operators conviven. SSA es el futuro; client-side apply existe por compatibilidad pero se recomienda migrar.</p>

      <h2>--dry-run: ensayar sin aplicar</h2>

      <p><code>kubectl</code> soporta tres modos de <em>dry-run</em>:</p>

      <ul>
        <li><strong><code>--dry-run=none</code></strong> (default) — aplica de verdad.</li>
        <li><strong><code>--dry-run=client</code></strong> — valida localmente: la estructura del YAML, la sintaxis, parsing. No manda nada al apiserver.</li>
        <li><strong><code>--dry-run=server</code></strong> — envía la petición al apiserver, que corre <em>toda la cadena</em> (auth, admission, validación, mutating webhooks) pero no persiste en etcd. Devuelve el objeto que se habría guardado.</li>
      </ul>

      <p>La segunda es rápida pero superficial. La tercera es poderosa: te dice exactamente qué habría pasado, incluyendo mutaciones que añaden admission controllers, valores por defecto que rellenaría el apiserver, y si un webhook rechazaría tu objeto.</p>

      <pre><code>kubectl apply -f deploy.yaml --dry-run=server -o yaml</code></pre>

      <p>Ese comando es mi favorito para depurar manifests: muestra el objeto exactamente como quedaría persistido, revelando cosas que tu YAML no decía explícitamente.</p>

      <h2>diff: comparar antes de aplicar</h2>

      <p>Hermano de <code>--dry-run=server</code>:</p>

      <pre><code>kubectl diff -f deploy.yaml</code></pre>

      <p>Muestra exactamente qué campos cambiarían si aplicaras. Útil para revisar qué va a pasar antes de mover algo en producción, y para integrarlo en pipelines de CI.</p>

      <h2>Por qué esto importa para el modelo declarativo</h2>

      <p>El modelo declarativo no se agota en <em>"escribí el YAML correcto"</em>. También exige que:</p>

      <ul>
        <li>Cada aplicación sea <strong>idempotente</strong> — lo mismo dos veces no hace dos cosas distintas.</li>
        <li>Los <strong>conflictos sean explícitos</strong> — dos fuentes de verdad no se pisan en silencio.</li>
        <li>Puedas <strong>previsualizar el efecto</strong> antes de ejecutarlo.</li>
      </ul>

      <p><code>apply</code> + server-side apply + <code>--dry-run=server</code> + <code>diff</code> son las herramientas que hacen realidad esos principios a nivel operacional. GitOps (Argo CD, Flux) se basa exactamente en este modelo, aplicando el YAML de git repetidamente y dejando que el cluster converja.</p>

      <h2>Claves para la KCNA</h2>

      <ul>
        <li><code>kubectl apply</code> es la forma declarativa; <code>create</code> y <code>replace</code> son imperativos.</li>
        <li>Client-side apply usa la annotation <code>last-applied-configuration</code>.</li>
        <li>Server-side apply mueve el merge al apiserver y añade <em>field ownership</em>.</li>
        <li><code>--dry-run=server</code> ejecuta toda la validación sin persistir.</li>
        <li><code>kubectl diff</code> compara tu YAML con el estado vivo.</li>
      </ul>

      <p>Llegamos al final del capítulo. En la siguiente sub-parte cerramos con un resumen que junta todo y te da el mapa que vas a llevar al <a href="/course/kubernetes-for-beginners/pods">capítulo 3 (Pods)</a>.</p>
    `,
  en: `
      <p>So far we've talked about the declarative model from the cluster's perspective. Now we look at the other side: yours, the client's. When you type <code>kubectl apply -f deploy.yaml</code>, what exactly does that tool do? When do you use <code>apply</code> vs <code>create</code> vs <code>replace</code>? And what on earth is <em>server-side apply</em>?</p>

      <p>Understanding this is not trivia: it's what separates using Kubernetes <em>imperatively</em> (every command is an action) from using it truly <em>declaratively</em> (each <code>apply</code> is a re-declaration of desired state).</p>

      <h2>kubectl is an HTTP client</h2>

      <p>Worth repeating: <code>kubectl</code> has no magic. It's a REST client that talks to <code>kube-apiserver</code>. Every command translates into an HTTP call. You can see it with:</p>

      <pre><code>kubectl apply -f deploy.yaml -v=8 2>&1 | grep -E "GET|POST|PATCH|PUT"</code></pre>

      <p>You'll see <code>apply</code> typically becomes a <code>GET</code> (to check if the object exists) followed by a <code>PATCH</code> (with the changes). <code>create</code> is a <code>POST</code>. <code>delete</code>, a <code>DELETE</code>. That direct.</p>

      <h2>apply vs create vs replace</h2>

      <p>All three change cluster state, but with different semantics:</p>

      <ul>
        <li><strong><code>create</code></strong> — <em>"create this new object. If it already exists, fail."</em> Imperative: assumes there was nothing before.</li>
        <li><strong><code>replace</code></strong> — <em>"replace this object with the one I'm giving you. If it doesn't exist, fail (unless you use <code>--force</code>)."</em> Also imperative: needs the prior object to work idempotently.</li>
        <li><strong><code>apply</code></strong> — <em>"make the cluster match this YAML. If the object doesn't exist, create it. If it exists, update it, respecting fields touched by other clients."</em> The only truly declarative one.</li>
      </ul>

      <p><code>apply</code> is the one you should use 99% of the time. <code>create</code> and <code>replace</code> are there for compatibility and old scripts, but they are not the system's native mode.</p>

      <h2>Client-side apply: how it originally worked</h2>

      <p>The historical implementation of <code>apply</code> lives on the client. The flow is:</p>

      <ol>
        <li><code>kubectl</code> stores your YAML as an annotation (<code>kubectl.kubernetes.io/last-applied-configuration</code>) on the object.</li>
        <li>Next time you apply, it computes a <em>diff</em> between: your current YAML, the stored last-applied-configuration, and the object's live state.</li>
        <li>It builds a <em>strategic merge patch</em> and sends it to the apiserver.</li>
      </ol>

      <p>It works, but has serious problems when multiple "clients" (humans, Argo CD, Helm, operators) touch the same object. Each had its own last-applied-configuration and silently overwrote each other.</p>

      <h2>Server-side apply: the evolution</h2>

      <p>To fix that, Kubernetes introduced <strong>server-side apply</strong> (SSA), stable since 1.22. The difference: the diff and merge are done by the apiserver, not the client.</p>

      <p>The key idea is <em>field ownership</em>. Every field of an object has an owner — the last client to write it. When another client tries to change a field it doesn't own, there's an explicit conflict. You decide whether to <code>--force-conflicts</code> (take ownership) or adjust your manifest.</p>

      <p>Example:</p>

      <pre><code>kubectl apply --server-side -f deploy.yaml</code></pre>

      <p>If an operator had already written <code>spec.replicas</code> (because it manages autoscaling) and you apply a YAML with <code>replicas: 3</code>, the apiserver tells you: <em>"there's a conflict on spec.replicas, whose owner is <code>hpa-controller</code>"</em>. Nothing gets blindly overwritten.</p>

      <p>This matters a lot in complex environments where GitOps and operators coexist. SSA is the future; client-side apply exists for compatibility but migration is recommended.</p>

      <h2>--dry-run: rehearse without applying</h2>

      <p><code>kubectl</code> supports three <em>dry-run</em> modes:</p>

      <ul>
        <li><strong><code>--dry-run=none</code></strong> (default) — actually applies.</li>
        <li><strong><code>--dry-run=client</code></strong> — validates locally: YAML structure, syntax, parsing. Nothing is sent to the apiserver.</li>
        <li><strong><code>--dry-run=server</code></strong> — sends the request to the apiserver, which runs <em>the entire chain</em> (auth, admission, validation, mutating webhooks) but doesn't persist to etcd. Returns the object that would have been stored.</li>
      </ul>

      <p>The second is fast but shallow. The third is powerful: it tells you exactly what would have happened, including mutations from admission controllers, default values the apiserver would fill in, and whether a webhook would reject your object.</p>

      <pre><code>kubectl apply -f deploy.yaml --dry-run=server -o yaml</code></pre>

      <p>That command is my favorite for debugging manifests: it shows the object exactly as it would end up stored, revealing things your YAML didn't explicitly say.</p>

      <h2>diff: compare before applying</h2>

      <p>Sibling of <code>--dry-run=server</code>:</p>

      <pre><code>kubectl diff -f deploy.yaml</code></pre>

      <p>Shows exactly which fields would change if you applied. Useful to review what's going to happen before you move anything in production, and to wire into CI pipelines.</p>

      <h2>Why this matters for the declarative model</h2>

      <p>The declarative model doesn't end at <em>"I wrote the right YAML"</em>. It also demands that:</p>

      <ul>
        <li>Every application is <strong>idempotent</strong> — the same thing twice doesn't do two different things.</li>
        <li><strong>Conflicts are explicit</strong> — two sources of truth don't silently overwrite each other.</li>
        <li>You can <strong>preview the effect</strong> before executing it.</li>
      </ul>

      <p><code>apply</code> + server-side apply + <code>--dry-run=server</code> + <code>diff</code> are the tools that turn those principles into operational reality. GitOps (Argo CD, Flux) is built exactly on this model, applying the git YAML repeatedly and letting the cluster converge.</p>

      <h2>KCNA keys</h2>

      <ul>
        <li><code>kubectl apply</code> is the declarative way; <code>create</code> and <code>replace</code> are imperative.</li>
        <li>Client-side apply uses the <code>last-applied-configuration</code> annotation.</li>
        <li>Server-side apply moves the merge to the apiserver and adds <em>field ownership</em>.</li>
        <li><code>--dry-run=server</code> runs the full validation chain without persisting.</li>
        <li><code>kubectl diff</code> compares your YAML against live state.</li>
      </ul>

      <p>We've reached the end of the chapter. In the next sub-part we close with a summary tying it all together and the map you'll carry into <a href="/course/kubernetes-for-beginners/pods">chapter 3 (Pods)</a>.</p>
    `,
}
