export default {
  es: `
      <p>Si pudieras llevarte solo cuatro comandos al examen KCNA y olvidar todos los demás, esos cuatro serían: <code>get</code>, <code>describe</code>, <code>logs</code> y <code>exec</code>. Con eso resuelves el 90% de cualquier diagnóstico real. Vamos uno por uno, después un par de extras.</p>

      <h2><code>kubectl get</code> — listar y consultar</h2>

      <pre><code>kubectl get pods
kubectl get pod nginx
kubectl get pods -o wide                # incluye nodo e IP
kubectl get pods -A                     # todos los namespaces
kubectl get pods -n kube-system
kubectl get pods -l app=nginx           # filtrar por label
kubectl get pod nginx -o yaml           # YAML completo del objeto
kubectl get pod nginx -o jsonpath='{.status.podIP}'</code></pre>

      <p>Algunos detalles que vale la pena tener en mente:</p>

      <ul>
        <li><code>-o wide</code> agrega columnas útiles (nodo, IP, nominated, readiness gates).</li>
        <li><code>-o yaml</code> es la versión completa del objeto, tal como vive en etcd. Útil para ver campos por defecto que el apiserver rellenó.</li>
        <li><code>-o jsonpath='{.path.to.field}'</code> extrae un campo concreto sin <code>jq</code>. Para scripts.</li>
        <li><code>-w</code> activa <em>watch</em>: la consola se queda abierta y refleja cambios en tiempo real.</li>
      </ul>

      <h2><code>kubectl describe</code> — el diagnóstico humano</h2>

      <pre><code>kubectl describe pod nginx</code></pre>

      <p>Esto es lo que más vas a usar cuando algo no arranca. La salida combina:</p>

      <ul>
        <li>Spec y status del Pod en formato legible.</li>
        <li>Conditions con razones y mensajes (lo que vimos en la <a href="/course/kubernetes-for-beginners/pods/ciclo-de-vida">sub-parte anterior</a>).</li>
        <li>Estado de cada contenedor (Running / Waiting / Terminated) con mensajes.</li>
        <li>Volúmenes montados, eventos asociados al Pod.</li>
        <li><strong>Events</strong> al final — la sección más útil. Aquí aparecen los <em>FailedScheduling</em>, <em>ImagePullBackOff</em>, <em>FailedMount</em>, etc., con timestamps y mensajes.</li>
      </ul>

      <p>Regla práctica: si algo no funciona, <code>describe</code> primero. Y mira los Events. La mayoría de los problemas ya tienen su explicación ahí.</p>

      <h2><code>kubectl logs</code> — qué imprimió el contenedor</h2>

      <pre><code>kubectl logs nginx
kubectl logs nginx -f                       # seguir en vivo (tail -f)
kubectl logs nginx --previous               # del intento anterior (clave en CrashLoopBackOff)
kubectl logs nginx -c sidecar               # contenedor específico (Pods multi)
kubectl logs nginx --tail=100               # últimas 100 líneas
kubectl logs nginx --since=10m              # últimos 10 minutos
kubectl logs -l app=nginx --max-log-requests=10  # de varios Pods que matchean label</code></pre>

      <p>Tres detalles importantes:</p>

      <ul>
        <li><strong><code>--previous</code></strong> (alias <code>-p</code>) muestra los logs del <em>contenedor anterior</em>. Esencial cuando un contenedor crashea inmediatamente: el actual no tiene logs útiles, pero el anterior sí.</li>
        <li><strong><code>-c &lt;container&gt;</code></strong> es obligatorio si el Pod tiene más de un contenedor. Sin ese flag, kubectl te pide elegir.</li>
        <li>Los logs salen de <code>stdout</code>/<code>stderr</code> del contenedor — si tu app escribe a archivo, no los vas a ver. Por eso las apps cloud-native escriben a stdout siempre.</li>
      </ul>

      <h2><code>kubectl exec</code> — meterte adentro</h2>

      <pre><code>kubectl exec nginx -- ls /etc/nginx
kubectl exec -it nginx -- /bin/sh
kubectl exec -it nginx -c sidecar -- /bin/bash</code></pre>

      <p><code>exec</code> arranca un proceso dentro del contenedor. Con <code>-it</code> obtienes una shell interactiva. Es útil pero <em>no</em> para arreglar nada en producción — los cambios se pierden cuando el contenedor reinicie. Solo para diagnóstico.</p>

      <p>Si la imagen del contenedor no tiene shell (distroless, scratch), <code>exec</code> falla. Para esos casos, el subcomando <code>debug</code> permite adjuntar un contenedor efímero con las herramientas que necesites:</p>

      <pre><code>kubectl debug nginx -it --image=busybox:1.36 --target=nginx</code></pre>

      <h2>Otros comandos útiles</h2>

      <h3><code>kubectl apply</code> y <code>kubectl delete</code></h3>

      <pre><code>kubectl apply -f pod.yaml
kubectl delete -f pod.yaml
kubectl delete pod nginx
kubectl delete pods -l app=nginx
kubectl delete pod nginx --grace-period=0 --force   # sin terminationGracePeriod (último recurso)</code></pre>

      <h3><code>kubectl port-forward</code></h3>

      <p>Reenvía un puerto local a un Pod, útil para acceder a servicios internos del cluster sin Ingress:</p>

      <pre><code>kubectl port-forward pod/nginx 8080:80
# Ahora curl localhost:8080 te llega al Pod nginx en su puerto 80.</code></pre>

      <h3><code>kubectl cp</code></h3>

      <p>Copia archivos entre tu máquina y un contenedor (requiere <code>tar</code> en la imagen):</p>

      <pre><code>kubectl cp ./config.json nginx:/etc/nginx/config.json
kubectl cp nginx:/var/log/nginx/access.log ./access.log</code></pre>

      <h3><code>kubectl run</code></h3>

      <p>Crea un Pod ad-hoc — la forma más rápida de tener un contenedor para pruebas:</p>

      <pre><code>kubectl run debug --rm -it --image=nicolaka/netshoot -- bash
# Pod efímero con herramientas de red, se borra al salir.</code></pre>

      <h2>Una sesión típica de diagnóstico</h2>

      <p>Cuando algo no anda, el flujo casi siempre es:</p>

      <pre><code>kubectl get pods                                     # ¿qué Pods hay y en qué estado?
kubectl get pods -o wide                             # ¿en qué nodo viven?
kubectl describe pod &lt;name&gt;                          # ¿qué dicen los Events?
kubectl logs &lt;name&gt; --previous                       # si crashea, log del intento anterior
kubectl exec -it &lt;name&gt; -- sh                        # si está vivo, entrar a ver
kubectl get events --sort-by='.lastTimestamp' -n &lt;ns&gt;  # eventos del namespace</code></pre>

      <p>Memoriza esos seis y vas a resolver los problemas que el examen y el día a día te van a tirar encima.</p>

      <h2>Para la KCNA</h2>

      <ul>
        <li><code>get</code>: listar; <code>-o wide/yaml/jsonpath</code>; <code>-l</code>; <code>-A</code>; <code>-w</code>.</li>
        <li><code>describe</code>: el diagnóstico narrativo, con <strong>Events</strong> al final.</li>
        <li><code>logs</code>: <code>-f</code>, <code>--previous</code>, <code>-c</code>, <code>--tail</code>, <code>--since</code>.</li>
        <li><code>exec -it &lt;pod&gt; -- sh</code>: shell interactiva. <code>kubectl debug</code> para imágenes distroless.</li>
        <li>Extras: <code>apply</code>/<code>delete</code>, <code>port-forward</code>, <code>cp</code>, <code>run</code>.</li>
      </ul>

      <p>En la siguiente sub-parte vemos quién gestiona Pods en producción. Spoiler de la introducción: tú no.</p>
    `,
  en: `
      <p>If you could only take four commands to the KCNA exam and forget the rest, it would be: <code>get</code>, <code>describe</code>, <code>logs</code>, and <code>exec</code>. With those four you handle 90% of any real debugging. Let's go through them, then a couple of extras.</p>

      <h2><code>kubectl get</code> — list and query</h2>

      <pre><code>kubectl get pods
kubectl get pod nginx
kubectl get pods -o wide                # adds node and IP
kubectl get pods -A                     # all namespaces
kubectl get pods -n kube-system
kubectl get pods -l app=nginx           # filter by label
kubectl get pod nginx -o yaml           # full YAML
kubectl get pod nginx -o jsonpath='{.status.podIP}'</code></pre>

      <p>Some details worth keeping in mind:</p>

      <ul>
        <li><code>-o wide</code> adds useful columns (node, IP, nominated, readiness gates).</li>
        <li><code>-o yaml</code> is the full object as it lives in etcd. Useful for seeing default fields the apiserver filled in.</li>
        <li><code>-o jsonpath='{.path.to.field}'</code> extracts a specific field without <code>jq</code>. Good for scripts.</li>
        <li><code>-w</code> turns on <em>watch</em>: the console stays open and reflects changes in real time.</li>
      </ul>

      <h2><code>kubectl describe</code> — the human-readable diagnosis</h2>

      <pre><code>kubectl describe pod nginx</code></pre>

      <p>This is what you'll use most when something doesn't start. The output combines:</p>

      <ul>
        <li>Pod spec and status in readable form.</li>
        <li>Conditions with reasons and messages (what we saw in the <a href="/course/kubernetes-for-beginners/pods/ciclo-de-vida">previous sub-part</a>).</li>
        <li>Each container's state (Running / Waiting / Terminated) with messages.</li>
        <li>Mounted volumes, events related to the Pod.</li>
        <li><strong>Events</strong> at the end — the most useful section. Here you'll see <em>FailedScheduling</em>, <em>ImagePullBackOff</em>, <em>FailedMount</em>, etc., with timestamps and messages.</li>
      </ul>

      <p>Practical rule: if something isn't working, <code>describe</code> first. And read the Events. Most problems already have their explanation right there.</p>

      <h2><code>kubectl logs</code> — what the container printed</h2>

      <pre><code>kubectl logs nginx
kubectl logs nginx -f                       # follow live (tail -f)
kubectl logs nginx --previous               # from the previous attempt (key on CrashLoopBackOff)
kubectl logs nginx -c sidecar               # specific container (multi-container Pods)
kubectl logs nginx --tail=100               # last 100 lines
kubectl logs nginx --since=10m              # last 10 minutes
kubectl logs -l app=nginx --max-log-requests=10  # from multiple Pods matching a label</code></pre>

      <p>Three important details:</p>

      <ul>
        <li><strong><code>--previous</code></strong> (alias <code>-p</code>) shows the logs of the <em>previous container</em>. Essential when a container crashes immediately: the current one has no useful logs, but the previous one does.</li>
        <li><strong><code>-c &lt;container&gt;</code></strong> is required if the Pod has more than one container. Without it, kubectl asks you to pick.</li>
        <li>Logs come from the container's <code>stdout</code>/<code>stderr</code> — if your app writes to a file, you won't see them. That's why cloud-native apps always write to stdout.</li>
      </ul>

      <h2><code>kubectl exec</code> — get inside</h2>

      <pre><code>kubectl exec nginx -- ls /etc/nginx
kubectl exec -it nginx -- /bin/sh
kubectl exec -it nginx -c sidecar -- /bin/bash</code></pre>

      <p><code>exec</code> starts a process inside the container. With <code>-it</code> you get an interactive shell. Useful, but <em>not</em> for fixing things in production — changes are lost when the container restarts. Diagnostics only.</p>

      <p>If the container's image has no shell (distroless, scratch), <code>exec</code> fails. For those cases, the <code>debug</code> subcommand lets you attach an ephemeral container with whatever tools you need:</p>

      <pre><code>kubectl debug nginx -it --image=busybox:1.36 --target=nginx</code></pre>

      <h2>Other useful commands</h2>

      <h3><code>kubectl apply</code> and <code>kubectl delete</code></h3>

      <pre><code>kubectl apply -f pod.yaml
kubectl delete -f pod.yaml
kubectl delete pod nginx
kubectl delete pods -l app=nginx
kubectl delete pod nginx --grace-period=0 --force   # bypass terminationGracePeriod (last resort)</code></pre>

      <h3><code>kubectl port-forward</code></h3>

      <p>Forwards a local port to a Pod, useful to access internal services without an Ingress:</p>

      <pre><code>kubectl port-forward pod/nginx 8080:80
# Now curl localhost:8080 reaches the nginx Pod on port 80.</code></pre>

      <h3><code>kubectl cp</code></h3>

      <p>Copies files between your machine and a container (requires <code>tar</code> in the image):</p>

      <pre><code>kubectl cp ./config.json nginx:/etc/nginx/config.json
kubectl cp nginx:/var/log/nginx/access.log ./access.log</code></pre>

      <h3><code>kubectl run</code></h3>

      <p>Creates an ad-hoc Pod — the fastest way to get a container for testing:</p>

      <pre><code>kubectl run debug --rm -it --image=nicolaka/netshoot -- bash
# Ephemeral Pod with networking tools, deleted on exit.</code></pre>

      <h2>A typical debugging session</h2>

      <p>When something is off, the flow almost always is:</p>

      <pre><code>kubectl get pods                                     # which Pods, what state?
kubectl get pods -o wide                             # which node?
kubectl describe pod &lt;name&gt;                          # what do the Events say?
kubectl logs &lt;name&gt; --previous                       # if it crashes, previous attempt's log
kubectl exec -it &lt;name&gt; -- sh                        # if it's alive, get in and look
kubectl get events --sort-by='.lastTimestamp' -n &lt;ns&gt;  # namespace events</code></pre>

      <p>Memorize those six and you'll handle the problems the exam — and your day-to-day — will throw at you.</p>

      <h2>For the KCNA</h2>

      <ul>
        <li><code>get</code>: list; <code>-o wide/yaml/jsonpath</code>; <code>-l</code>; <code>-A</code>; <code>-w</code>.</li>
        <li><code>describe</code>: narrative diagnosis, with <strong>Events</strong> at the bottom.</li>
        <li><code>logs</code>: <code>-f</code>, <code>--previous</code>, <code>-c</code>, <code>--tail</code>, <code>--since</code>.</li>
        <li><code>exec -it &lt;pod&gt; -- sh</code>: interactive shell. <code>kubectl debug</code> for distroless images.</li>
        <li>Extras: <code>apply</code>/<code>delete</code>, <code>port-forward</code>, <code>cp</code>, <code>run</code>.</li>
      </ul>

      <p>In the next sub-part we look at who manages Pods in production. Spoiler from the intro: not you.</p>
    `,
}
