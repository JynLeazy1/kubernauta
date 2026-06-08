export default {
  es: `
          <p>Un Pod no vive para siempre. Desde que kubelet recibe la instrucción de crearlo hasta que es eliminado, pasa por fases bien definidas. Entender el ciclo de vida es fundamental para diagnosticar problemas y diseñar aplicaciones que se comporten bien ante fallos.</p>

          <h2>Las fases de un Pod</h2>

          <p>El campo <code>status.phase</code> refleja el estado general del Pod desde la perspectiva del cluster.</p>

          <p><code>Pending</code> significa que el Pod fue aceptado pero sus contenedores aún no corren. Puede estar esperando que el scheduler le asigne un nodo, descargando imágenes, o esperando que los init containers terminen.</p>

          <p><code>Running</code> indica que al menos un contenedor está corriendo o en proceso de reiniciarse. No implica que el Pod esté listo para recibir tráfico — eso lo determina la readinessProbe.</p>

          <p><code>Succeeded</code> significa que todos los contenedores terminaron con exit 0 y no se reiniciarán. Es el estado final esperado para Jobs y tareas batch.</p>

          <p><code>Failed</code> indica que todos los contenedores terminaron pero al menos uno lo hizo con exit != 0. El Pod no se reiniciará.</p>

          <p><code>Unknown</code> aparece cuando el API server no puede obtener el estado del Pod, generalmente porque el nodo perdió comunicación con el cluster.</p>

          <pre><code>kubectl get pods
# NAME         READY   STATUS    RESTARTS   AGE
# mi-app-xyz   2/2     Running   0          5m
# mi-job-abc   0/1     Pending   0          30s
# mi-task      0/1     Completed 0          1h</code></pre>

          <h2>Las condiciones de un Pod</h2>

          <p>Las fases son demasiado gruesas para el diagnóstico real. Las condiciones son booleanas más granulares que reflejan sub-estados dentro de cada fase:</p>

          <pre><code>kubectl describe pod mi-app-xyz
# Conditions:
#   Type              Status
#   Initialized       True    ← Todos los init containers terminaron OK
#   Ready             True    ← Todos los contenedores Ready (readinessProbe OK)
#   ContainersReady   True    ← Todos los contenedores están listos
#   PodScheduled      True    ← El Pod fue asignado a un nodo</code></pre>

          <p>Cuando un Pod está en <code>Running</code> pero <code>Ready</code> es <code>False</code>, los contenedores están vivos pero no pasaron la readinessProbe. El Service no les mandará tráfico hasta que <code>Ready</code> sea <code>True</code>.</p>

          <h2>Probes: cómo kubelet pregunta si tu app sigue viva</h2>

          <p>Que un proceso esté vivo no significa que esté saludable. Un servidor web puede tener PID 1 pero estar bloqueado en un deadlock; un proceso puede haber arrancado pero todavía no estar listo para recibir tráfico. Para responder estas preguntas, kubelet ejecuta <strong>probes</strong> contra los contenedores en intervalos regulares. Hay tres tipos, cada uno con un propósito distinto:</p>

          <ul>
            <li><strong><code>livenessProbe</code></strong> — ¿el proceso está vivo y respondiendo? Si falla N veces seguidas, kubelet mata el contenedor y deja que <code>restartPolicy</code> decida si reiniciarlo.</li>
            <li><strong><code>readinessProbe</code></strong> — ¿el contenedor está listo para recibir tráfico? Si falla, kubelet saca al Pod del pool de endpoints de los Services. <em>No reinicia nada</em>; solo redirige el tráfico mientras el Pod no esté listo.</li>
            <li><strong><code>startupProbe</code></strong> — ¿la app terminó de arrancar? Mientras corre, liveness y readiness están suspendidas. Útil para apps con startup lento (JVMs cargando heaps grandes, migraciones de DB en startup) que de otra forma serían matadas por liveness durante el arranque.</li>
          </ul>

          <p>Cada probe puede usar uno de cuatro mecanismos:</p>

          <ul>
            <li><code>exec</code>: ejecuta un comando dentro del contenedor; exit 0 = éxito.</li>
            <li><code>httpGet</code>: hace un GET HTTP a un path; cualquier código 2xx o 3xx cuenta como éxito.</li>
            <li><code>tcpSocket</code>: intenta abrir una conexión TCP al puerto; éxito si conecta.</li>
            <li><code>grpc</code>: usa el <a href="https://grpc.io/docs/guides/health-checking/" target="_blank" rel="noopener">protocolo de health checking de gRPC</a> (kubelet 1.24+ con feature gate, GA en 1.27).</li>
          </ul>

          <p>Un ejemplo concreto con los tres tipos juntos:</p>

          <pre><code>spec:
  containers:
    - name: app
      image: my-app:1.0
      ports:
        - containerPort: 8080

      # Solo durante el arranque
      startupProbe:
        httpGet:
          path: /healthz
          port: 8080
        failureThreshold: 30           # 30 intentos × 10s = 5 min de gracia
        periodSeconds: 10

      # ¿Está vivo? (corre solo después de que startupProbe pasa)
      livenessProbe:
        httpGet:
          path: /healthz
          port: 8080
        periodSeconds: 10              # Cada 10s
        failureThreshold: 3            # 3 fallos seguidos → kill

      # ¿Listo para recibir tráfico?
      readinessProbe:
        httpGet:
          path: /ready
          port: 8080
        periodSeconds: 5
        failureThreshold: 1            # Un fallo basta para sacarlo del pool</code></pre>

          <p>Cuando una probe falla, lo ves en los eventos del Pod:</p>

          <pre><code>kubectl describe pod my-app
# ...
# Events:
#   Type     Reason     From     Message
#   ----     ------     ----     -------
#   Warning  Unhealthy  kubelet  Liveness probe failed: HTTP probe failed with statuscode: 500
#   Warning  Unhealthy  kubelet  Liveness probe failed: HTTP probe failed with statuscode: 500
#   Warning  Unhealthy  kubelet  Liveness probe failed: HTTP probe failed with statuscode: 500
#   Normal   Killing    kubelet  Container app failed liveness probe, will be restarted</code></pre>

          <p>Comprobaciones rápidas con <code>jsonpath</code>:</p>

          <pre><code># Estado actual de readiness por contenedor
kubectl get pod my-app -o jsonpath='{.status.containerStatuses[*].ready}'
# true false

# Cuántas veces se ha reiniciado el contenedor (suele indicar liveness fallando)
kubectl get pod my-app -o jsonpath='{.status.containerStatuses[*].restartCount}'
# 12</code></pre>

          <p>Por qué importa la distinción <code>liveness</code> vs <code>readiness</code>: ambas pueden parecer redundantes, pero hacen cosas opuestas. <strong>Liveness reinicia, readiness redirige tráfico.</strong> Sin readiness, una app que arranca lentamente recibe tráfico antes de estar lista — el Service no lo sabe. Sin liveness, una app deadlockeada nunca se reinicia — solo se queda como <code>Not Ready</code> mientras los logs se acumulan.</p>

          <div class="callout callout-warning">
            <strong>Trampa clásica con livenessProbe:</strong> apuntar liveness al mismo endpoint que readiness ("si está listo, está vivo") es mal diseño. Un fallo transitorio de readiness — p. ej. la base de datos parpadeando — terminaría reiniciando el contenedor en cascada. Regla de oro: <em>liveness verifica solo el proceso interno; readiness puede verificar dependencias externas</em>.
          </div>

          <h2>El flujo completo: de Pending a Running</h2>

          <pre><code>kubectl apply
  → Pending: scheduler busca nodo con recursos
  → Pending (PodScheduled: True): nodo asignado, kubelet descarga imágenes
  → Pending (Initialized: False): init containers corriendo en secuencia
  → Pending (Initialized: True): todos los init containers exitosos
  → Running (ContainersReady: False): pause + contenedores regulares arrancados
     startupProbe activa (si existe) → bloquea liveness y readiness
  → Running (ContainersReady: False): startupProbe pasó, readinessProbe corriendo
  → Running (Ready: True): readinessProbe OK → Pod entra al pool de endpoints</code></pre>

          <h2><code>restartPolicy</code>: qué hace kubelet cuando un contenedor muere</h2>

          <p><code>restartPolicy</code> es un campo del spec del Pod con tres valores posibles. <code>Always</code> reinicia el contenedor siempre que muere, sin importar el exit code — es el default para Deployments y la mayoría de workloads. <code>OnFailure</code> reinicia solo si el exit code es != 0, útil para Jobs que deben completarse exitosamente. <code>Never</code> no reinicia nunca — el contenedor muere y queda así.</p>

          <pre><code>spec:
  restartPolicy: Always   # Always | OnFailure | Never
  containers:
    - name: app
      image: my-app:1.0</code></pre>

          <p>Cuando kubelet reinicia un contenedor, no destruye ni recrea el Pod. El contenedor pause sigue vivo con sus namespaces — solo el contenedor que murió se recrea y se une al mismo sandbox. Por eso la IP del Pod no cambia entre reinicios.</p>

          <p>El reinicio no es inmediato — usa backoff exponencial:</p>

          <pre><code># 10s → 20s → 40s → 80s → 160s → 300s (máximo)
# Se resetea a 0 si el contenedor corre exitosamente por más de 10 minutos

kubectl get pods
# NAME     READY   STATUS             RESTARTS   AGE
# mi-app   0/1     CrashLoopBackOff   5          8m

# Razón exacta del último crash + exit code, sin abrir kubectl describe:
kubectl get pod mi-app -o jsonpath='{.status.containerStatuses[0].lastState.terminated}{"\\n"}'
# {"exitCode":1,"reason":"Error","startedAt":"2026-04-23T11:21:14Z",
#  "finishedAt":"2026-04-23T11:21:24Z","containerID":"containerd://3a9dd44..."}

# Y los eventos del Pod (suelen tener el mensaje más informativo):
kubectl describe pod mi-app | grep -A2 "Last State"
# Last State:    Terminated
#   Reason:      Error
#   Exit Code:   1</code></pre>

          <div class="callout callout-warning">
            <strong>CrashLoopBackOff no es un estado de Kubernetes:</strong> No aparece en <code>status.phase</code>. Es la forma en que <code>kubectl</code> muestra visualmente que el Pod está en bucle de reinicios con backoff. Internamente el Pod sigue en fase <code>Running</code>.
          </div>

          <h2>Terminación graceful</h2>

          <p>Cuando eliminas un Pod, Kubernetes sigue un proceso definido para no cortar conexiones abruptamente:</p>

          <pre><code># 1. kubectl delete pod mi-pod
#    → Pod marcado como "Terminating"
#    → Pod removido del pool de endpoints de todos los Services
#
# 2. kubelet envía SIGTERM a todos los contenedores
#    → El Pod tiene terminationGracePeriodSeconds para terminar (default: 30s)
#
# 3. Los contenedores manejan SIGTERM y cierran conexiones limpiamente
#
# 4. Si el tiempo se agota → kubelet envía SIGKILL</code></pre>

          <pre><code>spec:
  terminationGracePeriodSeconds: 60
  containers:
    - name: app
      lifecycle:
        preStop:
          exec:
            command: ["/bin/sh", "-c", "sleep 5"]
        # preStop se ejecuta antes del SIGTERM
        # útil para dar tiempo al load balancer de deregistrar el Pod</code></pre>

          <h2>Diagnóstico rápido</h2>

          <pre><code># Estado detallado y eventos
kubectl describe pod mi-pod

# Logs del contenedor actual
kubectl logs mi-pod -c app

# Logs del contenedor anterior (si crasheó y se reinició)
kubectl logs mi-pod -c app --previous

# Exit code del último crash
kubectl get pod mi-pod -o jsonpath='{.status.containerStatuses[0].lastState}'</code></pre>
        `,
  en: `
          <p>A Pod does not live forever. From the moment kubelet receives the instruction to create it until it is deleted, it passes through a series of well-defined phases. Understanding the lifecycle is critical for diagnosing issues and designing applications that behave well under failure.</p>

          <h2>Pod phases</h2>

          <p>The <code>status.phase</code> field reflects the overall state of the Pod from the cluster's perspective.</p>

          <p><code>Pending</code> means the Pod was accepted but its containers are not yet running. It may be waiting for the scheduler to assign a node, pulling images, or waiting for init containers to finish.</p>

          <p><code>Running</code> indicates that at least one container is running or in the process of restarting. It does not mean the Pod is ready to receive traffic — that is determined by the readinessProbe.</p>

          <p><code>Succeeded</code> means all containers exited with code 0 and will not restart. It is the expected final state for Jobs and batch tasks.</p>

          <p><code>Failed</code> indicates all containers have exited but at least one did so with a non-zero exit code. The Pod will not restart.</p>

          <p><code>Unknown</code> appears when the API server cannot obtain the Pod's state, usually because the node lost communication with the cluster.</p>

          <pre><code>kubectl get pods
# NAME         READY   STATUS    RESTARTS   AGE
# my-app-xyz   2/2     Running   0          5m
# my-job-abc   0/1     Pending   0          30s
# my-task      0/1     Completed 0          1h</code></pre>

          <h2>Pod conditions</h2>

          <p>Phases are too coarse for real diagnosis. Conditions are more granular booleans that reflect sub-states within each phase:</p>

          <pre><code>kubectl describe pod my-app-xyz
# Conditions:
#   Type              Status
#   Initialized       True    ← All init containers finished successfully
#   Ready             True    ← All containers Ready (readinessProbe OK)
#   ContainersReady   True    ← All containers are ready
#   PodScheduled      True    ← The Pod was assigned to a node</code></pre>

          <p>When a Pod is in <code>Running</code> but <code>Ready</code> is <code>False</code>, the containers are alive but did not pass the readinessProbe. The Service will not send traffic to them until <code>Ready</code> is <code>True</code>.</p>

          <h2>Probes: how kubelet asks whether your app is still alive</h2>

          <p>A live process is not the same as a healthy one. A web server can hold PID 1 but be deadlocked; a process can have started but not yet be ready to accept traffic. To answer those questions, kubelet runs <strong>probes</strong> against the containers at regular intervals. There are three types, each with a distinct purpose:</p>

          <ul>
            <li><strong><code>livenessProbe</code></strong> — is the process alive and responding? If it fails N times in a row, kubelet kills the container and lets <code>restartPolicy</code> decide whether to restart it.</li>
            <li><strong><code>readinessProbe</code></strong> — is the container ready to accept traffic? If it fails, kubelet pulls the Pod out of the Services' endpoint pool. <em>It does not restart anything</em>; it only redirects traffic away while the Pod is not ready.</li>
            <li><strong><code>startupProbe</code></strong> — has the app finished booting? While it is running, liveness and readiness are suspended. Useful for apps with slow startup (JVMs loading large heaps, DB migrations on boot) that would otherwise be killed by liveness during startup.</li>
          </ul>

          <p>Each probe can use one of four mechanisms:</p>

          <ul>
            <li><code>exec</code>: runs a command inside the container; exit 0 = success.</li>
            <li><code>httpGet</code>: performs an HTTP GET against a path; any 2xx or 3xx status counts as success.</li>
            <li><code>tcpSocket</code>: tries to open a TCP connection to a port; success if it connects.</li>
            <li><code>grpc</code>: uses the <a href="https://grpc.io/docs/guides/health-checking/" target="_blank" rel="noopener">gRPC health checking protocol</a> (kubelet 1.24+ with a feature gate, GA in 1.27).</li>
          </ul>

          <p>A concrete example with all three types together:</p>

          <pre><code>spec:
  containers:
    - name: app
      image: my-app:1.0
      ports:
        - containerPort: 8080

      # Only during startup
      startupProbe:
        httpGet:
          path: /healthz
          port: 8080
        failureThreshold: 30           # 30 attempts × 10s = 5 min grace
        periodSeconds: 10

      # Is it alive? (runs only after startupProbe passes)
      livenessProbe:
        httpGet:
          path: /healthz
          port: 8080
        periodSeconds: 10              # Every 10s
        failureThreshold: 3            # 3 consecutive failures → kill

      # Ready to receive traffic?
      readinessProbe:
        httpGet:
          path: /ready
          port: 8080
        periodSeconds: 5
        failureThreshold: 1            # A single failure pulls it from the pool</code></pre>

          <p>When a probe fails you see it in the Pod's events:</p>

          <pre><code>kubectl describe pod my-app
# ...
# Events:
#   Type     Reason     From     Message
#   ----     ------     ----     -------
#   Warning  Unhealthy  kubelet  Liveness probe failed: HTTP probe failed with statuscode: 500
#   Warning  Unhealthy  kubelet  Liveness probe failed: HTTP probe failed with statuscode: 500
#   Warning  Unhealthy  kubelet  Liveness probe failed: HTTP probe failed with statuscode: 500
#   Normal   Killing    kubelet  Container app failed liveness probe, will be restarted</code></pre>

          <p>Quick checks with <code>jsonpath</code>:</p>

          <pre><code># Current readiness state per container
kubectl get pod my-app -o jsonpath='{.status.containerStatuses[*].ready}'
# true false

# How many times the container has restarted (a liveness-failure tell)
kubectl get pod my-app -o jsonpath='{.status.containerStatuses[*].restartCount}'
# 12</code></pre>

          <p>Why the <code>liveness</code> vs <code>readiness</code> distinction matters: they can look redundant but do opposite things. <strong>Liveness restarts; readiness redirects traffic.</strong> Without readiness, a slow-starting app accepts traffic before it is ready — the Service has no idea. Without liveness, a deadlocked app never restarts — it just sits in <code>Not Ready</code> while logs pile up.</p>

          <div class="callout callout-warning">
            <strong>Classic livenessProbe trap:</strong> pointing liveness at the same endpoint as readiness ("if it is ready, it is alive") is a bad design. A transient readiness failure — e.g. the database briefly flapping — would cascade into restarting the container. Rule of thumb: <em>liveness only checks the in-process state; readiness can check external dependencies</em>.
          </div>

          <h2>The complete flow: from Pending to Running</h2>

          <pre><code>kubectl apply
  → Pending: scheduler looks for a node with resources
  → Pending (PodScheduled: True): node assigned, kubelet pulls images
  → Pending (Initialized: False): init containers running in sequence
  → Pending (Initialized: True): all init containers succeeded
  → Running (ContainersReady: False): pause + regular containers started
     startupProbe active (if it exists) → blocks liveness and readiness
  → Running (ContainersReady: False): startupProbe passed, readinessProbe running
  → Running (Ready: True): readinessProbe OK → Pod enters the endpoint pool</code></pre>

          <h2><code>restartPolicy</code>: what kubelet does when a container dies</h2>

          <p><code>restartPolicy</code> is a Pod spec field with three possible values. <code>Always</code> restarts the container whenever it dies, regardless of the exit code — it is the default for Deployments and most workloads. <code>OnFailure</code> restarts only if the exit code is non-zero, useful for Jobs that must complete successfully. <code>Never</code> never restarts — the container dies and stays that way.</p>

          <pre><code>spec:
  restartPolicy: Always   # Always | OnFailure | Never
  containers:
    - name: app
      image: my-app:1.0</code></pre>

          <p>When kubelet restarts a container, it does not destroy or recreate the Pod. The pause container stays alive with its namespaces — only the container that died is recreated and rejoins the same sandbox. That is why the Pod's IP does not change between restarts.</p>

          <p>The restart is not immediate — it uses exponential backoff:</p>

          <pre><code># 10s → 20s → 40s → 80s → 160s → 300s (maximum)
# Resets to 0 if the container runs successfully for more than 10 minutes

kubectl get pods
# NAME     READY   STATUS             RESTARTS   AGE
# my-app   0/1     CrashLoopBackOff   5          8m

# Exact reason for the last crash + exit code, no need to open kubectl describe:
kubectl get pod my-app -o jsonpath='{.status.containerStatuses[0].lastState.terminated}{"\\n"}'
# {"exitCode":1,"reason":"Error","startedAt":"2026-04-23T11:21:14Z",
#  "finishedAt":"2026-04-23T11:21:24Z","containerID":"containerd://3a9dd44..."}

# And the Pod events (usually carry the more informative message):
kubectl describe pod my-app | grep -A2 "Last State"
# Last State:    Terminated
#   Reason:      Error
#   Exit Code:   1</code></pre>

          <div class="callout callout-warning">
            <strong>CrashLoopBackOff is not a Kubernetes state:</strong> It does not appear in <code>status.phase</code>. It is just how <code>kubectl</code> visually displays that the Pod is in a restart loop with backoff. Internally the Pod remains in the <code>Running</code> phase.
          </div>

          <h2>Graceful termination</h2>

          <p>When you delete a Pod, Kubernetes follows a defined process to avoid cutting connections abruptly:</p>

          <pre><code># 1. kubectl delete pod my-pod
#    → Pod marked as "Terminating"
#    → Pod removed from all Services' endpoint pools
#
# 2. kubelet sends SIGTERM to all containers
#    → The Pod has terminationGracePeriodSeconds to finish (default: 30s)
#
# 3. Containers handle SIGTERM and close connections cleanly
#
# 4. If time runs out → kubelet sends SIGKILL</code></pre>

          <pre><code>spec:
  terminationGracePeriodSeconds: 60
  containers:
    - name: app
      lifecycle:
        preStop:
          exec:
            command: ["/bin/sh", "-c", "sleep 5"]
        # preStop runs before SIGTERM
        # useful to give the load balancer time to deregister the Pod</code></pre>

          <h2>Quick diagnosis</h2>

          <pre><code># Detailed state and events
kubectl describe pod my-pod

# Logs from the current container
kubectl logs my-pod -c app

# Logs from the previous container (if it crashed and restarted)
kubectl logs my-pod -c app --previous

# Exit code from the last crash
kubectl get pod my-pod -o jsonpath='{.status.containerStatuses[0].lastState}'</code></pre>
        `,
}
