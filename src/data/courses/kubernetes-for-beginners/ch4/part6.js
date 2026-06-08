export default {
  es: `
      <p>El rollout salió bien la mayoría de las veces. Pero a veces no. Una imagen tiene un bug que solo aparece bajo carga real, una variable de entorno se cambió mal, una migración de DB hizo algo distinto a lo que decía el changelog. La idea de tener una capa de versiones encima del ReplicaSet (esa fue la <em>razón de ser</em> del Deployment) es justamente para que volver atrás sea trivial.</p>

      <h2>El comando que importa</h2>

      <pre><code>kubectl rollout undo deployment/web</code></pre>

      <p>Eso te regresa a la <em>revisión inmediatamente anterior</em>. Si te equivocaste con el rollout que acabas de hacer, ese comando es tu botón de pánico. Funciona porque el ReplicaSet anterior sigue vivo con <code>replicas: 0</code>, esperando.</p>

      <p>Lo que pasa por dentro:</p>

      <ol>
        <li>El controller de Deployment lee el <code>rollout history</code> y encuentra la revisión N-1.</li>
        <li>Cambia el template del Deployment al de esa revisión.</li>
        <li>Inicia un rolling update — pero "hacia atrás": empieza a subir <code>replicas</code> en el RS viejo y a bajarlas en el actual.</li>
        <li>Cuando termina, el RS viejo vuelve a tener todas las réplicas. El RS que acababas de generar queda en <code>replicas: 0</code> (ahora él es el "anterior anterior", por si te arrepientes del arrepentimiento).</li>
      </ol>

      <h2>Volver a una revisión específica</h2>

      <p>Si necesitas regresar más atrás:</p>

      <pre><code>kubectl rollout history deployment/web

REVISION  CHANGE-CAUSE
1         &lt;none&gt;
2         kubectl set image deployment/web nginx=nginx:1.28
3         kubectl set image deployment/web nginx=nginx:1.29   ← actual

kubectl rollout undo deployment/web --to-revision=1</code></pre>

      <p>Salta directo a la 1. Cualquier revisión que quede "en medio" sigue en el historial — un undo no las borra.</p>

      <h2>Qué pasa con los Pods durante el rollback</h2>

      <p>Es exactamente la misma mecánica que un rolling update normal, respetando <code>maxSurge</code> y <code>maxUnavailable</code>. Si tu app tiene readiness probe configurada, los Pods de la versión vieja vuelven a recibir tráfico cuando responden OK; los de la nueva (rota) se van quitando del Service a medida que se eliminan.</p>

      <p>Ese es el motivo por el cual <strong>un rollback no es magia</strong>: requiere que la versión anterior <em>siga siendo desplegable</em>. Si entre tanto se borraron los ConfigMaps que usaba, o se rotaron los Secrets, o cambió el schema de la DB, el rollback va a fallar tan ridículamente como el rollout original.</p>

      <h2>Por qué los ReplicaSets viejos quedan vivos</h2>

      <p>Por defecto, un Deployment guarda hasta 10 ReplicaSets viejos como historial. Lo controla:</p>

      <pre><code>spec:
  revisionHistoryLimit: 10</code></pre>

      <p>Bajarlo ahorra objetos en etcd; subirlo te da más opciones de rollback. En clusters grandes con muchos Deployments y rollouts diarios, dejarlo en algo más bajo (ej. 3) es razonable.</p>

      <p>Importante: cada ReplicaSet viejo tiene <code>replicas: 0</code>, así que <strong>no consume recursos del cluster</strong> — solo objetos en la base de datos. La sensación de "está usando memoria" es falsa; los Pods muertos no existen, solo el ReplicaSet vacío.</p>

      <h2>El rollback no es tu plan A</h2>

      <p>Vale la pena decirlo: el rollback existe para cuando otras defensas fallaron. Las que tendrían que detener un rollout malo antes:</p>

      <ul>
        <li><strong>readiness probes serias</strong> — si los Pods nuevos nunca llegan a Ready, el Deployment no avanza el rollout. Lo cubrimos en el <a href="/course/kubernetes-for-beginners/pods/ciclo-de-vida">capítulo 3</a>.</li>
        <li><strong>maxUnavailable: 0</strong> — garantiza que nunca tienes menos capacidad de la declarada durante el rollout.</li>
        <li><strong>progressDeadlineSeconds</strong> — un timeout. Si el rollout no progresa en X segundos, el Deployment se marca como <code>Progressing=False</code>. Tu pipeline puede detectarlo y hacer undo automático.</li>
        <li><strong>Estrategias más cuidadosas</strong> (canary, blue/green) — vienen en el <a href="/course/kubernetes-for-beginners/rolling-updates">capítulo 11</a>.</li>
      </ul>

      <p>Pero cuando todas fallan, <code>kubectl rollout undo</code> sigue ahí.</p>

      <h2>Una sesión de rollback típica</h2>

      <pre><code># Te das cuenta de que algo anda mal después de actualizar:
kubectl rollout status deployment/web
# Waiting... (los Pods nuevos no responden bien)

# Ver historial:
kubectl rollout history deployment/web

# Volver a la anterior:
kubectl rollout undo deployment/web

# Ver que se está revirtiendo:
kubectl rollout status deployment/web
# deployment "web" successfully rolled back

# Confirmar que la imagen volvió a la vieja:
kubectl get deploy web -o jsonpath='{.spec.template.spec.containers[0].image}'</code></pre>

      <h2>Para la KCNA</h2>

      <ul>
        <li><code>kubectl rollout undo deployment/X</code> — vuelve a la revisión anterior.</li>
        <li><code>--to-revision=N</code> — vuelve a una específica.</li>
        <li>El historial vive en los ReplicaSets viejos, controlado por <code>spec.revisionHistoryLimit</code>.</li>
        <li>Un ReplicaSet con <code>replicas: 0</code> no consume recursos — solo espacio en etcd.</li>
        <li>Rollback = rolling update inverso. Respeta <code>maxSurge</code>, <code>maxUnavailable</code> y readiness probes.</li>
        <li>El rollback no funciona si la versión vieja ya no es desplegable (ConfigMaps borrados, schema de DB cambiado).</li>
      </ul>

      <p>Cerramos en la siguiente sub-parte con el resumen del capítulo y el bridge al <a href="/course/kubernetes-for-beginners/configmaps-secrets">capítulo 5 (ConfigMaps y Secrets)</a>, donde vamos a ver cómo le pasas configuración a estas apps que ya sabes desplegar.</p>
    `,
  en: `
      <p>The rollout went well most of the time. But sometimes it doesn't. An image has a bug that only shows up under real load, an env var got changed wrong, a DB migration did something different from what the changelog said. The whole point of having a versioning layer on top of ReplicaSet (that's <em>why</em> Deployment exists) is to make rolling back trivial.</p>

      <h2>The command that matters</h2>

      <pre><code>kubectl rollout undo deployment/web</code></pre>

      <p>That sends you back to the <em>immediately previous revision</em>. If you screwed up the rollout you just did, this is your panic button. It works because the previous ReplicaSet is still alive with <code>replicas: 0</code>, waiting.</p>

      <p>What happens underneath:</p>

      <ol>
        <li>The Deployment controller reads the <code>rollout history</code> and finds revision N-1.</li>
        <li>Sets the Deployment's template to that revision's template.</li>
        <li>Starts a rolling update — but "backwards": it bumps <code>replicas</code> on the old RS up and on the current one down.</li>
        <li>When it finishes, the old RS has all replicas back. The RS you just generated stays at <code>replicas: 0</code> (now it's the "previous-previous", in case you regret your regret).</li>
      </ol>

      <h2>Roll back to a specific revision</h2>

      <p>To go further back:</p>

      <pre><code>kubectl rollout history deployment/web

REVISION  CHANGE-CAUSE
1         &lt;none&gt;
2         kubectl set image deployment/web nginx=nginx:1.28
3         kubectl set image deployment/web nginx=nginx:1.29   ← current

kubectl rollout undo deployment/web --to-revision=1</code></pre>

      <p>Jumps straight to revision 1. Anything "in between" stays in the history — undo doesn't delete it.</p>

      <h2>What happens to Pods during a rollback</h2>

      <p>It's the exact same mechanic as a normal rolling update, respecting <code>maxSurge</code> and <code>maxUnavailable</code>. If your app has a readiness probe, the old version's Pods start receiving traffic again as they respond OK; the new (broken) ones get pulled from the Service as they're removed.</p>

      <p>That's why <strong>a rollback isn't magic</strong>: it requires the previous version to <em>still be deployable</em>. If meanwhile the ConfigMaps it used got deleted, the Secrets got rotated, or the DB schema changed, the rollback will fail just as ridiculously as the original rollout.</p>

      <h2>Why old ReplicaSets stay alive</h2>

      <p>By default, a Deployment keeps up to 10 old ReplicaSets as history. Controlled by:</p>

      <pre><code>spec:
  revisionHistoryLimit: 10</code></pre>

      <p>Lowering it saves objects in etcd; raising it gives you more rollback options. In big clusters with lots of Deployments and daily rollouts, keeping it lower (e.g. 3) is reasonable.</p>

      <p>Important: each old ReplicaSet has <code>replicas: 0</code>, so it <strong>uses no cluster resources</strong> — only database objects. The "it's using memory" feeling is false; dead Pods don't exist, only the empty ReplicaSet does.</p>

      <h2>Rollback isn't your plan A</h2>

      <p>Worth saying: rollback exists for when other defenses failed. The ones that should stop a bad rollout before it gets there:</p>

      <ul>
        <li><strong>Serious readiness probes</strong> — if new Pods never become Ready, the Deployment doesn't advance the rollout. We covered them in <a href="/course/kubernetes-for-beginners/pods/ciclo-de-vida">chapter 3</a>.</li>
        <li><strong>maxUnavailable: 0</strong> — guarantees you never have less than declared capacity during the rollout.</li>
        <li><strong>progressDeadlineSeconds</strong> — a timeout. If the rollout doesn't progress in X seconds, the Deployment is marked <code>Progressing=False</code>. Your pipeline can detect this and undo automatically.</li>
        <li><strong>More careful strategies</strong> (canary, blue/green) — coming in <a href="/course/kubernetes-for-beginners/rolling-updates">chapter 11</a>.</li>
      </ul>

      <p>But when they all fail, <code>kubectl rollout undo</code> is still there.</p>

      <h2>A typical rollback session</h2>

      <pre><code># You realize something is wrong after the update:
kubectl rollout status deployment/web
# Waiting... (the new Pods aren't responding well)

# Check history:
kubectl rollout history deployment/web

# Roll back to the previous revision:
kubectl rollout undo deployment/web

# Watch it revert:
kubectl rollout status deployment/web
# deployment "web" successfully rolled back

# Confirm the image went back to the old one:
kubectl get deploy web -o jsonpath='{.spec.template.spec.containers[0].image}'</code></pre>

      <h2>For the KCNA</h2>

      <ul>
        <li><code>kubectl rollout undo deployment/X</code> — go back to the previous revision.</li>
        <li><code>--to-revision=N</code> — go back to a specific one.</li>
        <li>History lives in the old ReplicaSets, controlled by <code>spec.revisionHistoryLimit</code>.</li>
        <li>A ReplicaSet with <code>replicas: 0</code> consumes no resources — only space in etcd.</li>
        <li>Rollback = reverse rolling update. Respects <code>maxSurge</code>, <code>maxUnavailable</code>, and readiness probes.</li>
        <li>Rollback fails if the old version is no longer deployable (ConfigMaps deleted, DB schema changed).</li>
      </ul>

      <p>We close in the next sub-part with the chapter recap and the bridge to <a href="/course/kubernetes-for-beginners/configmaps-secrets">chapter 5 (ConfigMaps and Secrets)</a>, where we'll see how to pass configuration to all these apps you now know how to deploy.</p>
    `,
}
