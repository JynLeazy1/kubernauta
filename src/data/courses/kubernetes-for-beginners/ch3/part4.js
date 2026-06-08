export default {
  es: `
      <p>En la <a href="/course/kubernetes-for-beginners/pods/single-vs-multi-contenedor">sub-parte anterior</a> dijimos que cuando tiene sentido meter más de un contenedor en un Pod hay tres patrones clásicos con nombre propio: <em>init container</em>, <em>sidecar</em> y <em>ambassador</em>. Vamos uno por uno, con YAML real.</p>

      <h2>Init containers</h2>

      <p>Un <strong>init container</strong> es un contenedor especial que corre <strong>antes</strong> que los contenedores principales del Pod. Si hay varios, corren en orden, secuencialmente. Cada uno debe terminar con éxito (exit 0) para que el siguiente arranque, y solo cuando <em>todos</em> terminan, los contenedores normales arrancan.</p>

      <p>Se declaran en un campo aparte:</p>

      <pre><code>spec:
  initContainers:
    - name: wait-for-db
      image: busybox:1.36
      command: ["sh", "-c"]
      args:
        - until nc -z db 5432; do echo "waiting for db"; sleep 2; done
    - name: db-migrate
      image: myapp-migrations:1.0
      env:
        - name: DATABASE_URL
          value: postgres://db:5432/myapp
  containers:
    - name: app
      image: myapp:1.0</code></pre>

      <p>En este ejemplo el Pod no arranca su contenedor <code>app</code> hasta que (1) el servicio <code>db</code> responda en el puerto 5432 y (2) las migraciones de base de datos hayan corrido. Si cualquier init container falla, Kubernetes reinicia el Pod desde cero según el <code>restartPolicy</code>.</p>

      <p>Casos típicos para init containers:</p>

      <ul>
        <li><strong>Esperar dependencias</strong>: que un Service esté listo, que una DB acepte conexiones.</li>
        <li><strong>Migraciones</strong>: correr esquemas, semillas, fixtures antes de arrancar la app.</li>
        <li><strong>Setup de archivos</strong>: descargar configuración, generar certificados, decompresar artefactos a un volumen compartido.</li>
        <li><strong>Permisos</strong>: ajustar ownership de un volumen antes de que la app — corriendo como non-root — lo use.</li>
      </ul>

      <h2>Sidecars</h2>

      <p>Un <strong>sidecar</strong> es un contenedor auxiliar que corre <em>junto</em> al contenedor principal durante toda la vida del Pod. Su misión es potenciar al principal: capturar logs, exponerlo detrás de un proxy, sincronizar archivos, recolectar métricas, lo que sea — pero sin que el principal tenga que cambiar su código.</p>

      <p>Históricamente, los sidecars se modelaban como containers normales en el mismo Pod, lo cual tenía un detalle incómodo: <strong>en un Job, el sidecar nunca terminaba</strong>. La app principal exitaba 0, pero el sidecar seguía vivo, así que el Job nunca se daba por completado. La gente parchaba esto matando al sidecar manualmente.</p>

      <p>Desde Kubernetes 1.29, hay <strong>sidecars nativos</strong>. Son init containers con <code>restartPolicy: Always</code>:</p>

      <pre><code>spec:
  initContainers:
    - name: log-shipper
      image: fluent-bit:3.0
      restartPolicy: Always       # ← lo que lo hace sidecar nativo
      volumeMounts:
        - name: logs
          mountPath: /var/log/app
          readOnly: true
  containers:
    - name: app
      image: myapp:1.0
      volumeMounts:
        - name: logs
          mountPath: /var/log/app
  volumes:
    - name: logs
      emptyDir: {}</code></pre>

      <p>Lo que cambia con esto:</p>

      <ul>
        <li>El sidecar arranca <em>antes</em> que el contenedor principal y queda corriendo.</li>
        <li>Cuando el principal termina (en un Job), Kubernetes mata al sidecar automáticamente.</li>
        <li>Al borrar el Pod, primero termina el contenedor principal y después el sidecar — orden inverso al arranque.</li>
      </ul>

      <p>Casos típicos para sidecars:</p>

      <ul>
        <li><strong>Logging</strong>: fluent-bit, promtail, vector tomando los logs de un volumen compartido.</li>
        <li><strong>Service mesh</strong>: Envoy / Linkerd interceptando todo el tráfico de red del contenedor principal.</li>
        <li><strong>Recarga de config</strong>: un proceso que vigila Secrets/ConfigMaps y notifica al principal cuando cambian.</li>
        <li><strong>Backup</strong>: un agente que respalda periódicamente el estado del principal a almacenamiento externo.</li>
      </ul>

      <div class="callout callout-note">
        <span class="callout-label">Compatibilidad</span>
        <p>Los sidecars al estilo "viejo" (containers normales corriendo junto al principal) <em>siguen funcionando</em>. La forma nativa con <code>restartPolicy: Always</code> en init containers es la recomendada para casos nuevos, y es la única que resuelve el problema del sidecar inmortal en Jobs.</p>
      </div>

      <h2>Ambassador</h2>

      <p>El <strong>ambassador</strong> es un caso particular del sidecar: un proxy local que <em>simplifica</em> el acceso del contenedor principal a algo externo. Pensar: <em>"el contenedor principal habla siempre con <code>localhost:6379</code>; el ambassador se encarga del resto"</em>.</p>

      <pre><code>spec:
  containers:
    - name: app
      image: myapp:1.0
      env:
        - name: REDIS_URL
          value: redis://localhost:6379    # siempre localhost
    - name: redis-ambassador
      image: envoy:1.30
      args: ["--config-path", "/etc/envoy.yaml"]
      # Envoy con reglas para routear localhost:6379
      # al cluster Redis real (con TLS, retries, failover, etc.)</code></pre>

      <p>El uso clásico era abstraer la complejidad de hablar con un servicio externo (TLS, retries, sharding) detrás de un endpoint local trivial. En la práctica, hoy ese rol lo cumplen los <em>service meshes</em> (Istio, Linkerd) instalando un sidecar Envoy automáticamente para todos los Pods. El ambassador como patrón explícito se usa menos, pero conviene reconocerlo para la KCNA.</p>

      <h2>Ejemplo combinado</h2>

      <pre><code>spec:
  initContainers:
    - name: db-migrate                # init: corre y termina
      image: myapp-migrations:1.0
    - name: log-shipper               # sidecar nativo
      image: fluent-bit:3.0
      restartPolicy: Always
      volumeMounts:
        - { name: logs, mountPath: /var/log/app, readOnly: true }
  containers:
    - name: app
      image: myapp:1.0
      volumeMounts:
        - { name: logs, mountPath: /var/log/app }
    - name: redis-ambassador         # ambassador
      image: envoy:1.30
  volumes:
    - { name: logs, emptyDir: {} }</code></pre>

      <p>Este Pod tiene los tres patrones. Init para preparar (migraciones), sidecar para acompañar (log shipping), ambassador para abstraer (proxy hacia Redis). Cada uno con su responsabilidad clara, todos compartiendo el mismo Pod porque <em>tienen</em> que vivir juntos.</p>

      <h2>Para la KCNA</h2>

      <ul>
        <li>Init containers: corren antes, en orden, deben terminar OK.</li>
        <li>Sidecars: corren junto al principal toda la vida del Pod. Desde 1.29 los nativos van en <code>initContainers</code> con <code>restartPolicy: Always</code>.</li>
        <li>Ambassador: caso especial de sidecar que actúa como proxy local hacia algo externo.</li>
        <li>Todos comparten red (localhost) y pueden compartir volúmenes con el contenedor principal.</li>
      </ul>

      <p>En la siguiente sub-parte vemos el ciclo de vida del Pod: fases, conditions, las tres clases de probes y el <code>restartPolicy</code> que decide quién se reinicia y cuándo.</p>
    `,
  en: `
      <p>In the <a href="/course/kubernetes-for-beginners/pods/single-vs-multi-contenedor">previous sub-part</a> we said that when it makes sense to put more than one container in a Pod, there are three classic patterns with proper names: <em>init container</em>, <em>sidecar</em>, and <em>ambassador</em>. Let's go through them one at a time, with real YAML.</p>

      <h2>Init containers</h2>

      <p>An <strong>init container</strong> is a special container that runs <strong>before</strong> the Pod's main containers. If there are several, they run in order, sequentially. Each must finish successfully (exit 0) before the next starts, and only when <em>all</em> finish do the regular containers start.</p>

      <p>They're declared in their own field:</p>

      <pre><code>spec:
  initContainers:
    - name: wait-for-db
      image: busybox:1.36
      command: ["sh", "-c"]
      args:
        - until nc -z db 5432; do echo "waiting for db"; sleep 2; done
    - name: db-migrate
      image: myapp-migrations:1.0
      env:
        - name: DATABASE_URL
          value: postgres://db:5432/myapp
  containers:
    - name: app
      image: myapp:1.0</code></pre>

      <p>In this example the Pod doesn't start its <code>app</code> container until (1) the <code>db</code> service responds on port 5432 and (2) database migrations have run. If any init container fails, Kubernetes restarts the Pod from scratch according to the <code>restartPolicy</code>.</p>

      <p>Typical use cases for init containers:</p>

      <ul>
        <li><strong>Wait for dependencies</strong>: a Service to be ready, a DB to accept connections.</li>
        <li><strong>Migrations</strong>: run schemas, seeds, fixtures before booting the app.</li>
        <li><strong>File setup</strong>: download config, generate certs, unpack artifacts into a shared volume.</li>
        <li><strong>Permissions</strong>: fix ownership on a volume before the app — running as non-root — uses it.</li>
      </ul>

      <h2>Sidecars</h2>

      <p>A <strong>sidecar</strong> is a helper container that runs <em>alongside</em> the main container for the whole life of the Pod. Its job is to enhance the main one: capture logs, expose it behind a proxy, sync files, collect metrics — anything, but without making the main container change its code.</p>

      <p>Historically, sidecars were modeled as regular containers in the same Pod, which had an awkward side effect: <strong>in a Job, the sidecar would never finish</strong>. The main app exited 0, but the sidecar kept running, so the Job never marked itself completed. People worked around it by killing the sidecar manually.</p>

      <p>Since Kubernetes 1.29, there are <strong>native sidecars</strong>. They're init containers with <code>restartPolicy: Always</code>:</p>

      <pre><code>spec:
  initContainers:
    - name: log-shipper
      image: fluent-bit:3.0
      restartPolicy: Always       # ← what makes it a native sidecar
      volumeMounts:
        - name: logs
          mountPath: /var/log/app
          readOnly: true
  containers:
    - name: app
      image: myapp:1.0
      volumeMounts:
        - name: logs
          mountPath: /var/log/app
  volumes:
    - name: logs
      emptyDir: {}</code></pre>

      <p>What this changes:</p>

      <ul>
        <li>The sidecar starts <em>before</em> the main container and stays running.</li>
        <li>When the main one exits (in a Job), Kubernetes kills the sidecar automatically.</li>
        <li>On Pod deletion, the main container terminates first and the sidecar after — reverse start order.</li>
      </ul>

      <p>Typical use cases for sidecars:</p>

      <ul>
        <li><strong>Logging</strong>: fluent-bit, promtail, vector reading logs from a shared volume.</li>
        <li><strong>Service mesh</strong>: Envoy / Linkerd intercepting all of the main container's network traffic.</li>
        <li><strong>Config reload</strong>: a process watching Secrets/ConfigMaps and signaling the main one when they change.</li>
        <li><strong>Backup</strong>: an agent periodically backing up the main container's state to external storage.</li>
      </ul>

      <div class="callout callout-note">
        <span class="callout-label">Compatibility</span>
        <p>"Old-style" sidecars (regular containers running next to the main one) <em>still work</em>. The native form using <code>restartPolicy: Always</code> on init containers is the recommended one for new cases, and it's the only one that solves the immortal-sidecar problem in Jobs.</p>
      </div>

      <h2>Ambassador</h2>

      <p>The <strong>ambassador</strong> is a special case of the sidecar: a local proxy that <em>simplifies</em> the main container's access to something external. Think: <em>"the main container always talks to <code>localhost:6379</code>; the ambassador handles the rest"</em>.</p>

      <pre><code>spec:
  containers:
    - name: app
      image: myapp:1.0
      env:
        - name: REDIS_URL
          value: redis://localhost:6379    # always localhost
    - name: redis-ambassador
      image: envoy:1.30
      args: ["--config-path", "/etc/envoy.yaml"]
      # Envoy rules to route localhost:6379
      # to the real Redis cluster (with TLS, retries, failover, etc.)</code></pre>

      <p>The classic use was hiding the complexity of talking to an external service (TLS, retries, sharding) behind a trivial local endpoint. In practice, today this role is filled by <em>service meshes</em> (Istio, Linkerd) automatically injecting an Envoy sidecar into every Pod. The ambassador as an explicit pattern is used less, but it's worth recognizing for the KCNA.</p>

      <h2>Combined example</h2>

      <pre><code>spec:
  initContainers:
    - name: db-migrate                # init: runs and exits
      image: myapp-migrations:1.0
    - name: log-shipper               # native sidecar
      image: fluent-bit:3.0
      restartPolicy: Always
      volumeMounts:
        - { name: logs, mountPath: /var/log/app, readOnly: true }
  containers:
    - name: app
      image: myapp:1.0
      volumeMounts:
        - { name: logs, mountPath: /var/log/app }
    - name: redis-ambassador         # ambassador
      image: envoy:1.30
  volumes:
    - { name: logs, emptyDir: {} }</code></pre>

      <p>This Pod has all three patterns. Init to prepare (migrations), sidecar to accompany (log shipping), ambassador to abstract (proxy to Redis). Each with a clear responsibility, all sharing the same Pod because they <em>have</em> to live together.</p>

      <h2>For the KCNA</h2>

      <ul>
        <li>Init containers: run first, in order, must finish OK.</li>
        <li>Sidecars: run alongside the main container for the Pod's whole life. Since 1.29, the native ones are declared in <code>initContainers</code> with <code>restartPolicy: Always</code>.</li>
        <li>Ambassador: a special case of sidecar that acts as a local proxy to something external.</li>
        <li>All share networking (localhost) and can share volumes with the main container.</li>
      </ul>

      <p>In the next sub-part we look at the Pod's lifecycle: phases, conditions, the three kinds of probes, and the <code>restartPolicy</code> that decides who restarts and when.</p>
    `,
}
