export default {
  es: `
      <p>Hasta acá hablamos del Pod en estado estable: arrancado, corriendo. Pero en la realidad un Pod es un objeto con <em>etapas</em>: nace, se arranca, puede fallar, puede sanar, eventualmente muere. Entender esa máquina de estados es la diferencia entre <em>"se rompió mi Pod"</em> y <em>"el Pod está en CrashLoopBackOff porque el liveness probe falla en el segundo 5"</em>.</p>

      <h2>Phases: el resumen de una palabra</h2>

      <p>Cada Pod tiene un campo <code>status.phase</code> que es uno de estos cinco valores:</p>

      <ul>
        <li><strong><code>Pending</code></strong>: el apiserver aceptó el Pod pero todavía no está corriendo. Puede estar esperando ser asignado a un nodo, descargando imágenes, o ejecutando init containers.</li>
        <li><strong><code>Running</code></strong>: asignado a un nodo, al menos un contenedor corriendo (o reiniciándose).</li>
        <li><strong><code>Succeeded</code></strong>: todos los contenedores terminaron con éxito y no van a reiniciarse.</li>
        <li><strong><code>Failed</code></strong>: todos los contenedores terminaron, al menos uno con error y sin reintentos pendientes.</li>
        <li><strong><code>Unknown</code></strong>: kubelet no responde — el control plane no sabe qué pasa.</li>
      </ul>

      <p>La <em>phase</em> es solo un resumen alto. Para diagnosticar de verdad hay que mirar las <em>conditions</em>.</p>

      <h2>Conditions: el detalle real</h2>

      <p>El <code>status.conditions</code> es una lista que dice si el Pod cumple ciertas condiciones específicas. Las cuatro estándar:</p>

      <ul>
        <li><strong><code>PodScheduled</code></strong>: ¿le asignó nodo el scheduler?</li>
        <li><strong><code>Initialized</code></strong>: ¿corrieron y terminaron los init containers?</li>
        <li><strong><code>ContainersReady</code></strong>: ¿están todos los contenedores listos según sus probes?</li>
        <li><strong><code>Ready</code></strong>: el Pod entero está listo para recibir tráfico (depende de <code>ContainersReady</code> + posibles <em>readiness gates</em>).</li>
      </ul>

      <p><code>kubectl describe pod &lt;name&gt;</code> te muestra estos campos. Cada condition tiene un <code>status</code> (<code>True</code>/<code>False</code>) y, si es <code>False</code>, un <code>reason</code> y <code>message</code> que dicen por qué. Es la primera parada cuando algo no arranca.</p>

      <h2>Las tres clases de probes</h2>

      <p>Un <em>probe</em> es una pregunta que kubelet le hace al contenedor periódicamente: <em>"¿estás bien?"</em>. Hay tres clases, cada una con un propósito distinto:</p>

      <h3>livenessProbe</h3>

      <p>Pregunta: <em>"¿el contenedor sigue vivo?"</em>. Si falla, kubelet <strong>reinicia el contenedor</strong>. Útil para detectar deadlocks, memory leaks que dejan el proceso vivo pero inutil, o estados zombi.</p>

      <pre><code>livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 15
  periodSeconds: 10
  failureThreshold: 3</code></pre>

      <p>En este ejemplo, kubelet espera 15 segundos después del arranque, después hace <code>GET /healthz:8080</code> cada 10 segundos. Si falla 3 veces seguidas, mata el contenedor (que el <code>restartPolicy</code> decide si se vuelve a arrancar).</p>

      <h3>readinessProbe</h3>

      <p>Pregunta: <em>"¿está listo para recibir tráfico?"</em>. Si falla, kubelet <strong>no reinicia nada</strong> — solo marca el Pod como <code>NotReady</code>, lo que <strong>quita su IP de los endpoints</strong> de las Services que lo seleccionaban.</p>

      <pre><code>readinessProbe:
  httpGet:
    path: /ready
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5</code></pre>

      <p>Útil cuando un contenedor está <em>vivo</em> pero <em>no listo</em>: cargando un modelo de ML, calentando cachés, esperando que un cliente DB se conecte. Quieres que siga corriendo, pero que no le caigan requests todavía.</p>

      <h3>startupProbe</h3>

      <p>Pregunta: <em>"¿ya terminó de arrancar?"</em>. Mientras esté corriendo, deshabilita los otros dos probes. Útil para apps con arranque lento (legacy, JVM, modelos grandes) donde un <code>livenessProbe</code> agresivo las mataría antes de que terminen de iniciar.</p>

      <pre><code>startupProbe:
  httpGet:
    path: /healthz
    port: 8080
  failureThreshold: 30
  periodSeconds: 10
  # Da hasta 30 × 10s = 5 minutos para arrancar.</code></pre>

      <h2>Tipos de probe</h2>

      <p>Cualquiera de los tres puede ser:</p>

      <ul>
        <li><strong><code>httpGet</code></strong>: hace un GET HTTP a un path/puerto. Status 2xx o 3xx = éxito.</li>
        <li><strong><code>tcpSocket</code></strong>: intenta abrir una conexión TCP al puerto. Conecta = éxito.</li>
        <li><strong><code>exec</code></strong>: ejecuta un comando dentro del contenedor. Exit 0 = éxito.</li>
        <li><strong><code>grpc</code></strong>: usa el protocolo gRPC Health Checking estándar.</li>
      </ul>

      <p>HTTP es el más común y suele ser la opción correcta. <code>exec</code> tiene su lugar pero es más caro (crea un proceso por probe).</p>

      <h2>restartPolicy</h2>

      <p>Define qué hace kubelet cuando un contenedor termina (con o sin error). Solo aplica al contenedor — el Pod en sí mismo no "se reinicia"; lo que se reinicia son sus contenedores dentro del mismo Pod.</p>

      <ul>
        <li><strong><code>Always</code></strong> (default): cualquier salida — éxito o fallo — desencadena un reinicio. Es lo correcto para Deployments y StatefulSets, donde la app debe estar siempre corriendo.</li>
        <li><strong><code>OnFailure</code></strong>: reinicia solo si el contenedor terminó con código distinto a 0. Default para los Jobs que usan <code>backoffLimit</code>.</li>
        <li><strong><code>Never</code></strong>: nunca reinicia. El Pod queda en <code>Succeeded</code> o <code>Failed</code> según el exit code y se queda ahí hasta que alguien lo borre.</li>
      </ul>

      <p>Detalle importante: cuando kubelet reinicia un contenedor, no recrea el Pod. Conservas la misma IP, los mismos volúmenes, las mismas conexiones a sus contenedores hermanos. Solo el proceso del contenedor se levanta de nuevo.</p>

      <h2>CrashLoopBackOff: el síntoma más común</h2>

      <p>Cuando un contenedor falla repetidamente y kubelet lo intenta reiniciar, lo hace con <em>backoff exponencial</em>: 10s, 20s, 40s, hasta un tope de 5 minutos entre intentos. Mientras está esperando antes del próximo intento, el contenedor está en estado <strong>CrashLoopBackOff</strong>.</p>

      <p>Es el estado que vas a ver cuando: la imagen no existe, falta una variable de entorno crítica, el comando es incorrecto, el liveness probe falla apenas arranca, etc. <code>kubectl logs --previous &lt;pod&gt;</code> es tu mejor amigo aquí: te muestra los logs del intento <em>anterior</em> al actual, que suelen tener el error real.</p>

      <h2>Para la KCNA</h2>

      <ul>
        <li>Phases: Pending → Running → Succeeded/Failed/Unknown.</li>
        <li>Conditions: PodScheduled, Initialized, ContainersReady, Ready.</li>
        <li>livenessProbe falla → reinicia el contenedor.</li>
        <li>readinessProbe falla → quita IP de endpoints (no reinicia).</li>
        <li>startupProbe corre solo al arranque, deshabilita liveness/readiness mientras tanto.</li>
        <li>restartPolicy: Always (default), OnFailure, Never.</li>
        <li>CrashLoopBackOff = backoff exponencial entre reintentos.</li>
      </ul>

      <p>En la siguiente sub-parte vemos los comandos del día a día: <code>get</code>, <code>describe</code>, <code>logs</code>, <code>exec</code>. Tu kit mínimo para diagnosticar todo lo que vimos hasta acá.</p>
    `,
  en: `
      <p>So far we've talked about the Pod in steady state: started, running. But in reality a Pod is an object with <em>stages</em>: it's born, it starts, it can fail, it can heal, eventually it dies. Understanding that state machine is the difference between <em>"my Pod broke"</em> and <em>"the Pod is in CrashLoopBackOff because the liveness probe fails at second 5"</em>.</p>

      <h2>Phases: a one-word summary</h2>

      <p>Every Pod has a <code>status.phase</code> field that is one of five values:</p>

      <ul>
        <li><strong><code>Pending</code></strong>: the apiserver accepted the Pod but it isn't running yet. It might be waiting for node assignment, pulling images, or running init containers.</li>
        <li><strong><code>Running</code></strong>: assigned to a node, at least one container running (or restarting).</li>
        <li><strong><code>Succeeded</code></strong>: all containers finished successfully and won't restart.</li>
        <li><strong><code>Failed</code></strong>: all containers finished, at least one with an error, no retries pending.</li>
        <li><strong><code>Unknown</code></strong>: kubelet isn't responding — the control plane doesn't know what's happening.</li>
      </ul>

      <p>Phase is just a high-level summary. To actually diagnose, you look at the <em>conditions</em>.</p>

      <h2>Conditions: the real detail</h2>

      <p><code>status.conditions</code> is a list saying whether the Pod meets certain specific conditions. The four standard ones:</p>

      <ul>
        <li><strong><code>PodScheduled</code></strong>: did the scheduler assign a node?</li>
        <li><strong><code>Initialized</code></strong>: have the init containers run and finished?</li>
        <li><strong><code>ContainersReady</code></strong>: are all containers ready according to their probes?</li>
        <li><strong><code>Ready</code></strong>: is the whole Pod ready to receive traffic (depends on <code>ContainersReady</code> + any <em>readiness gates</em>).</li>
      </ul>

      <p><code>kubectl describe pod &lt;name&gt;</code> shows these. Each condition has a <code>status</code> (<code>True</code>/<code>False</code>) and, if <code>False</code>, a <code>reason</code> and <code>message</code> explaining why. It's your first stop when something doesn't start.</p>

      <h2>The three kinds of probes</h2>

      <p>A <em>probe</em> is a question kubelet asks the container periodically: <em>"are you OK?"</em>. There are three kinds, each with a different purpose:</p>

      <h3>livenessProbe</h3>

      <p>Question: <em>"is the container still alive?"</em>. If it fails, kubelet <strong>restarts the container</strong>. Useful for catching deadlocks, memory leaks that leave the process alive but useless, or zombie states.</p>

      <pre><code>livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 15
  periodSeconds: 10
  failureThreshold: 3</code></pre>

      <p>In this example, kubelet waits 15 seconds after startup, then runs <code>GET /healthz:8080</code> every 10 seconds. If it fails 3 times in a row, it kills the container (and <code>restartPolicy</code> decides whether it comes back).</p>

      <h3>readinessProbe</h3>

      <p>Question: <em>"is it ready to receive traffic?"</em>. If it fails, kubelet <strong>doesn't restart anything</strong> — it just marks the Pod as <code>NotReady</code>, which <strong>removes its IP from the endpoints</strong> of any Services that selected it.</p>

      <pre><code>readinessProbe:
  httpGet:
    path: /ready
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5</code></pre>

      <p>Useful when a container is <em>alive</em> but <em>not ready</em>: loading an ML model, warming caches, waiting for a DB client to connect. You want it to keep running, but you don't want requests landing on it yet.</p>

      <h3>startupProbe</h3>

      <p>Question: <em>"are you done starting up?"</em>. While it's running, it disables the other two probes. Useful for slow-starting apps (legacy, JVM, large models) where an aggressive <code>livenessProbe</code> would kill them before they finish initializing.</p>

      <pre><code>startupProbe:
  httpGet:
    path: /healthz
    port: 8080
  failureThreshold: 30
  periodSeconds: 10
  # Allows up to 30 × 10s = 5 minutes to start.</code></pre>

      <h2>Probe types</h2>

      <p>Any of the three can be:</p>

      <ul>
        <li><strong><code>httpGet</code></strong>: makes an HTTP GET to a path/port. Status 2xx or 3xx = success.</li>
        <li><strong><code>tcpSocket</code></strong>: tries to open a TCP connection to the port. Connect = success.</li>
        <li><strong><code>exec</code></strong>: runs a command inside the container. Exit 0 = success.</li>
        <li><strong><code>grpc</code></strong>: uses the standard gRPC Health Checking protocol.</li>
      </ul>

      <p>HTTP is the most common and usually the right choice. <code>exec</code> has its place but is more expensive (creates a process per probe).</p>

      <h2>restartPolicy</h2>

      <p>Defines what kubelet does when a container exits (with or without error). It applies to the container — the Pod itself doesn't "restart"; what restarts is its containers within the same Pod.</p>

      <ul>
        <li><strong><code>Always</code></strong> (default): any exit — success or failure — triggers a restart. Right for Deployments and StatefulSets where the app should be running constantly.</li>
        <li><strong><code>OnFailure</code></strong>: restart only if the container exited with a non-zero code. Default for Jobs that use <code>backoffLimit</code>.</li>
        <li><strong><code>Never</code></strong>: never restarts. The Pod stays in <code>Succeeded</code> or <code>Failed</code> based on the exit code, and stays that way until someone deletes it.</li>
      </ul>

      <p>Important detail: when kubelet restarts a container, it doesn't recreate the Pod. You keep the same IP, the same volumes, the same connections to sibling containers. Only the container's process comes back up.</p>

      <h2>CrashLoopBackOff: the most common symptom</h2>

      <p>When a container fails repeatedly and kubelet keeps restarting it, it does so with <em>exponential backoff</em>: 10s, 20s, 40s, up to a 5-minute cap between attempts. While it's waiting for the next try, the container is in <strong>CrashLoopBackOff</strong>.</p>

      <p>It's the state you'll see when: the image doesn't exist, a critical env var is missing, the command is wrong, the liveness probe fails right after startup, etc. <code>kubectl logs --previous &lt;pod&gt;</code> is your best friend here: it shows the logs from the <em>previous</em> attempt, which usually contain the actual error.</p>

      <h2>For the KCNA</h2>

      <ul>
        <li>Phases: Pending → Running → Succeeded/Failed/Unknown.</li>
        <li>Conditions: PodScheduled, Initialized, ContainersReady, Ready.</li>
        <li>livenessProbe fails → restart the container.</li>
        <li>readinessProbe fails → remove IP from endpoints (no restart).</li>
        <li>startupProbe runs only at startup, disables liveness/readiness while it does.</li>
        <li>restartPolicy: Always (default), OnFailure, Never.</li>
        <li>CrashLoopBackOff = exponential backoff between retries.</li>
      </ul>

      <p>In the next sub-part we look at the day-to-day commands: <code>get</code>, <code>describe</code>, <code>logs</code>, <code>exec</code>. Your minimum kit to debug everything we've seen so far.</p>
    `,
}
