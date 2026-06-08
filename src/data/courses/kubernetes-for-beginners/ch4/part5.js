export default {
  es: `
      <p>Toca lo práctico: dos cosas que vas a hacer todos los días con Deployments — escalar y actualizar — y los comandos exactos para hacerlas. Lo importante no es solo la sintaxis: es entender qué pasa por debajo cada vez que las corres.</p>

      <h2>Escalar: subir o bajar réplicas</h2>

      <p>Tres formas de cambiar el <code>replicas</code> de un Deployment:</p>

      <h3>1. <code>kubectl scale</code></h3>

      <pre><code>kubectl scale deployment/web --replicas=10</code></pre>

      <p>El más rápido, ideal para una emergencia o un experimento. Es <em>imperativo</em>: cambia el cluster pero no toca tu YAML local. La próxima vez que apliques tu manifest desde git, la cuenta vuelve al valor del archivo.</p>

      <h3>2. <code>kubectl edit</code></h3>

      <pre><code>kubectl edit deployment/web</code></pre>

      <p>Abre el YAML del objeto en vivo en tu editor. Cambias <code>replicas: 3</code> a <code>replicas: 10</code>, guardas, y kubectl manda el patch. También imperativo.</p>

      <h3>3. Editar el YAML y aplicar</h3>

      <pre><code>vim deployment.yaml          # cambias replicas: 10
kubectl apply -f deployment.yaml</code></pre>

      <p>El correcto para producción. Tu git refleja el estado deseado. Si usas GitOps (Argo CD, Flux), esta es la única forma válida.</p>

      <h2>Qué pasa cuando escalas</h2>

      <p>Subir de 3 a 10:</p>

      <ol>
        <li><code>kubectl</code> hace un PATCH al Deployment con el nuevo <code>replicas</code>.</li>
        <li>El Deployment controller ve el cambio y actualiza el <code>replicas</code> de su ReplicaSet actual.</li>
        <li>El ReplicaSet controller ve que tiene 3 Pods cuando debería tener 10. Crea 7 nuevos.</li>
        <li>El scheduler asigna nodo a cada Pod nuevo, kubelet los arranca.</li>
      </ol>

      <p>Bajar de 10 a 3 es similar pero al revés: el RS marca 7 Pods para borrar (el algoritmo prioriza Pods <em>no listos</em>, después los más nuevos), kubelet ejecuta el shutdown respetando <code>terminationGracePeriodSeconds</code>.</p>

      <h2>Actualizar: cambiar la imagen</h2>

      <p>Tres formas también:</p>

      <h3>1. <code>kubectl set image</code></h3>

      <pre><code>kubectl set image deployment/web nginx=nginx:1.28</code></pre>

      <p>El imperativo más común. Sintaxis: <code>nombre-del-contenedor=nueva-imagen</code>. Si tu Deployment tiene varios contenedores, los puedes cambiar todos en un comando.</p>

      <h3>2. <code>kubectl edit</code></h3>

      <p>Igual que para escalar, pero cambias el campo <code>image</code> del template.</p>

      <h3>3. Actualizar YAML y aplicar</h3>

      <p>El correcto para producción y GitOps. Tu repo siempre refleja qué versión está corriendo.</p>

      <h2>Mirar el rollout en vivo</h2>

      <p>Cuando disparas un cambio en el template (imagen, env, recursos), el Deployment empieza un <em>rollout</em>. Para seguirlo:</p>

      <pre><code>kubectl rollout status deployment/web</code></pre>

      <p>Bloquea hasta que termine, y muestra mensajes tipo <em>"Waiting for deployment 'web' rollout to finish: 2 of 3 updated replicas are available..."</em>. Salida con <code>0</code> si fue exitoso, no-cero si timeout o falla.</p>

      <p>Otros que te ayudan a diagnosticar:</p>

      <pre><code>kubectl get rs -l app=web                 # ves el RS nuevo creciendo y el viejo bajando
kubectl get pods -l app=web -w            # cada Pod creándose / muriendo en tiempo real
kubectl describe deployment web           # estado, conditions, historial reciente
kubectl rollout history deployment/web    # lista de revisiones</code></pre>

      <h2>El historial de revisiones</h2>

      <pre><code>kubectl rollout history deployment/web

REVISION  CHANGE-CAUSE
1         &lt;none&gt;
2         kubectl set image deployment/web nginx=nginx:1.28
3         kubectl set image deployment/web nginx=nginx:1.29</code></pre>

      <p>Cada cambio del template incrementa la revisión. La columna <code>CHANGE-CAUSE</code> sale del comando que la disparó cuando se usó <code>--record</code> (deprecated) o de la annotation <code>kubernetes.io/change-cause</code> que pongas tú.</p>

      <p>Y para inspeccionar una revisión específica:</p>

      <pre><code>kubectl rollout history deployment/web --revision=2</code></pre>

      <p>Esto vas a usarlo en la siguiente sub-parte cuando hablemos de rollback. Es la base.</p>

      <h2>Pausar y resumir un rollout</h2>

      <p>Si necesitas hacer varios cambios al template y dispararlos como un solo rollout (en vez de uno por edit):</p>

      <pre><code>kubectl rollout pause deployment/web
kubectl set image deployment/web nginx=nginx:1.29
kubectl set env deployment/web FEATURE_FLAG=on
# Acumula cambios sin rotar Pods.
kubectl rollout resume deployment/web
# Ahora rota.</code></pre>

      <p>Útil para no causar dos rollouts seguidos.</p>

      <h2>Para la KCNA</h2>

      <ul>
        <li>Escalar: <code>kubectl scale deployment/X --replicas=N</code> (imperativo) o cambiar el YAML y <code>apply</code> (declarativo).</li>
        <li>Actualizar imagen: <code>kubectl set image deployment/X container=image:tag</code>.</li>
        <li>Ver rollout: <code>kubectl rollout status</code>, <code>kubectl get rs</code>, <code>kubectl get pods -w</code>.</li>
        <li>Historial: <code>kubectl rollout history deployment/X</code>.</li>
        <li>Pausar/resumir: <code>kubectl rollout pause/resume</code> para acumular cambios.</li>
      </ul>

      <p>En la siguiente sub-parte vemos qué hacer cuando un rollout sale mal: cómo regresar a una versión anterior, qué pasa con los Pods, y por qué los ReplicaSets viejos quedan vivos como red de seguridad.</p>
    `,
  en: `
      <p>Time for the practical part: two things you'll do every day with Deployments — scale and update — and the exact commands to do them. The important part isn't just the syntax: it's understanding what happens underneath each time you run them.</p>

      <h2>Scale: up or down</h2>

      <p>Three ways to change a Deployment's <code>replicas</code>:</p>

      <h3>1. <code>kubectl scale</code></h3>

      <pre><code>kubectl scale deployment/web --replicas=10</code></pre>

      <p>Fastest, ideal for an emergency or experiment. It's <em>imperative</em>: changes the cluster but doesn't touch your local YAML. Next time you apply your manifest from git, the count goes back to the file's value.</p>

      <h3>2. <code>kubectl edit</code></h3>

      <pre><code>kubectl edit deployment/web</code></pre>

      <p>Opens the live YAML in your editor. You change <code>replicas: 3</code> to <code>replicas: 10</code>, save, and kubectl sends the patch. Also imperative.</p>

      <h3>3. Edit the YAML and apply</h3>

      <pre><code>vim deployment.yaml          # change replicas: 10
kubectl apply -f deployment.yaml</code></pre>

      <p>The correct one for production. Your git reflects desired state. If you use GitOps (Argo CD, Flux), this is the only valid way.</p>

      <h2>What happens when you scale</h2>

      <p>Going from 3 to 10:</p>

      <ol>
        <li><code>kubectl</code> sends a PATCH to the Deployment with the new <code>replicas</code>.</li>
        <li>The Deployment controller sees the change and updates the <code>replicas</code> on its current ReplicaSet.</li>
        <li>The ReplicaSet controller sees it has 3 Pods when it should have 10. Creates 7 new ones.</li>
        <li>The scheduler assigns a node to each new Pod, kubelet starts them.</li>
      </ol>

      <p>Going from 10 to 3 is similar but reversed: the RS marks 7 Pods for deletion (the algorithm prefers Pods <em>not Ready</em>, then newest first), kubelet runs the shutdown respecting <code>terminationGracePeriodSeconds</code>.</p>

      <h2>Update: change the image</h2>

      <p>Three ways here too:</p>

      <h3>1. <code>kubectl set image</code></h3>

      <pre><code>kubectl set image deployment/web nginx=nginx:1.28</code></pre>

      <p>The most common imperative way. Syntax: <code>container-name=new-image</code>. If your Deployment has several containers, you can change them all in one command.</p>

      <h3>2. <code>kubectl edit</code></h3>

      <p>Same as for scaling, but you change the template's <code>image</code> field.</p>

      <h3>3. Update the YAML and apply</h3>

      <p>The right one for production and GitOps. Your repo always reflects what version is running.</p>

      <h2>Watch the rollout live</h2>

      <p>When you trigger a template change (image, env, resources), the Deployment starts a <em>rollout</em>. To follow it:</p>

      <pre><code>kubectl rollout status deployment/web</code></pre>

      <p>Blocks until it finishes, with messages like <em>"Waiting for deployment 'web' rollout to finish: 2 of 3 updated replicas are available..."</em>. Exits <code>0</code> on success, non-zero on timeout or failure.</p>

      <p>Other helpful ones for debugging:</p>

      <pre><code>kubectl get rs -l app=web                 # see the new RS growing and the old shrinking
kubectl get pods -l app=web -w            # each Pod being created / dying in real time
kubectl describe deployment web           # state, conditions, recent history
kubectl rollout history deployment/web    # list of revisions</code></pre>

      <h2>The revision history</h2>

      <pre><code>kubectl rollout history deployment/web

REVISION  CHANGE-CAUSE
1         &lt;none&gt;
2         kubectl set image deployment/web nginx=nginx:1.28
3         kubectl set image deployment/web nginx=nginx:1.29</code></pre>

      <p>Every template change increments the revision. The <code>CHANGE-CAUSE</code> column comes from <code>--record</code> (deprecated) or the <code>kubernetes.io/change-cause</code> annotation you set yourself.</p>

      <p>To inspect a specific revision:</p>

      <pre><code>kubectl rollout history deployment/web --revision=2</code></pre>

      <p>You'll use this in the next sub-part when we cover rollback. It's the base.</p>

      <h2>Pause and resume a rollout</h2>

      <p>If you need to make several template changes and trigger them as a single rollout (instead of one per edit):</p>

      <pre><code>kubectl rollout pause deployment/web
kubectl set image deployment/web nginx=nginx:1.29
kubectl set env deployment/web FEATURE_FLAG=on
# Accumulate changes without rotating Pods.
kubectl rollout resume deployment/web
# Now it rotates.</code></pre>

      <p>Useful to avoid two back-to-back rollouts.</p>

      <h2>For the KCNA</h2>

      <ul>
        <li>Scale: <code>kubectl scale deployment/X --replicas=N</code> (imperative) or change the YAML and <code>apply</code> (declarative).</li>
        <li>Update image: <code>kubectl set image deployment/X container=image:tag</code>.</li>
        <li>Watch rollout: <code>kubectl rollout status</code>, <code>kubectl get rs</code>, <code>kubectl get pods -w</code>.</li>
        <li>History: <code>kubectl rollout history deployment/X</code>.</li>
        <li>Pause/resume: <code>kubectl rollout pause/resume</code> to batch changes.</li>
      </ul>

      <p>In the next sub-part we cover what to do when a rollout goes wrong: how to revert to a previous version, what happens to the Pods, and why old ReplicaSets stay alive as a safety net.</p>
    `,
}
