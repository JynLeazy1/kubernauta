export default {
  es: `
      <p>En los dos capítulos anteriores vimos la topografía del cluster (<a href="/course/kubernetes-for-beginners/architecture">capítulo 1</a>) y el contrato declarativo de su API (<a href="/course/kubernetes-for-beginners/api-and-declarative-model">capítulo 2</a>). Con eso de base, toca abrir el primer objeto real. Y como dice la <a href="https://kubernetes.io/docs/concepts/workloads/pods/" target="_blank" rel="noopener noreferrer">documentación oficial</a>, el Pod es <em>"la unidad computable más pequeña y fundamental"</em> de Kubernetes.</p>

      <p>Esa frase suena a eslogan hasta que entiendes por qué es cierta — y por qué, si te la tomas en serio, cambia cómo piensas todo lo demás.</p>

      <h2>Un Pod no es un contenedor</h2>

      <p>Casi todos los tutoriales al explicar qué es un Pod arrancan con: <em>"es un contenedor, pero con algunos extras"</em>. Es una simplificación peligrosa. Un Pod no es <em>un</em> contenedor: es un <strong>entorno compartido</strong> donde corre <em>uno o más</em> contenedores que comparten red, almacenamiento y ciclo de vida.</p>

      <p>Mecánicamente, un Pod es un conjunto de namespaces de Linux — de red, de IPC, a veces de PID — que Kubernetes crea antes de levantar tus contenedores de aplicación. Esos namespaces son lo que hace que los contenedores dentro del Pod se vean como si corrieran en la misma máquina virtual: pueden hablar por <code>localhost</code>, compartir volúmenes, ver los mismos archivos. Son, en efecto, hermanos.</p>

      <p>Kubelet construye ese entorno con un contenedor auxiliar, casi invisible, llamado <code>pause</code>, cuya única tarea es mantener vivos los namespaces mientras los contenedores de tu aplicación se crean, mueren y se reinician encima.</p>

      <div class="callout callout-note">
        <span class="callout-label">Profundizar</span>
        <p>Toda la mecánica — el contenedor <code>pause</code>, cómo kubelet arma el Pod paso a paso, cómo el CNI le asigna una IP — está cubierta a fondo en el tutorial <a href="/tutorial/que-es-un-pod">¿Qué es un Pod?</a>. Este capítulo se queda en el nivel KCNA: qué necesitas saber para pasar el examen y tener un modelo mental correcto para trabajar.</p>
      </div>

      <h2>Por qué la distinción importa</h2>

      <p>Si entendieras un Pod como "un contenedor con otro nombre", varias cosas de Kubernetes te parecerían arbitrarias:</p>

      <ul>
        <li>Por qué no puedes "migrar" un contenedor entre Pods. (Porque un contenedor <em>vive dentro</em> de un conjunto específico de namespaces; sacarlo de ahí sería destruirlo.)</li>
        <li>Por qué todos los contenedores de un mismo Pod comparten la misma IP. (Porque comparten el namespace de red.)</li>
        <li>Por qué al matar un Pod se matan <em>todos</em> sus contenedores juntos. (Porque su ciclo de vida está amarrado al de los namespaces.)</li>
        <li>Por qué un sidecar "funciona": puede interceptar tráfico o leer archivos del container principal <em>sin permisos especiales</em>. (Porque están en los mismos namespaces.)</li>
      </ul>

      <p>Cuando ves al Pod como lo que realmente es — un entorno compartido de namespaces — esas cosas dejan de ser reglas raras y pasan a ser consecuencias obvias.</p>

      <h2>Lo que vamos a ver en este capítulo</h2>

      <ol>
        <li><strong>Anatomía del <code>spec</code></strong>: cómo se ve un Pod manifest por dentro — containers, image, ports, env, resources, volumes.</li>
        <li><strong>Single-container vs multi-container</strong>: cuándo tiene sentido meter más de un contenedor en un Pod y cuándo es un error.</li>
        <li><strong>Sidecars, init containers y ambassadors</strong>: los patrones clásicos, con ejemplos, más el sidecar nativo que llegó en 1.29.</li>
        <li><strong>Ciclo de vida, probes y <code>restartPolicy</code></strong>: fases, condiciones, liveness/readiness/startup, y quién decide reiniciar qué.</li>
        <li><strong>Comandos esenciales</strong>: <code>get</code>, <code>describe</code>, <code>logs</code>, <code>exec</code> — tu kit mínimo para trabajar con Pods.</li>
        <li><strong>Quién gestiona Pods en producción</strong>: Deployment, StatefulSet, DaemonSet, Job, CronJob. Spoiler: no vas a crear Pods a mano.</li>
      </ol>

      <p>Al final, vas a poder leer cualquier YAML de Pod, explicar cada campo, y entender por qué está donde está. Y, más importante, vas a tener el modelo mental correcto para todos los capítulos que vienen — porque cada otro objeto que vamos a ver se apoya sobre esta idea de "Pod como entorno compartido".</p>
    `,
  en: `
      <p>In the previous two chapters we saw the topography of the cluster (<a href="/course/kubernetes-for-beginners/architecture">chapter 1</a>) and the declarative contract of its API (<a href="/course/kubernetes-for-beginners/api-and-declarative-model">chapter 2</a>). With that foundation, it's time to open the first real object. And as the <a href="https://kubernetes.io/docs/concepts/workloads/pods/" target="_blank" rel="noopener noreferrer">official documentation</a> says, the Pod is <em>"the smallest and most fundamental computable unit"</em> in Kubernetes.</p>

      <p>That line sounds like a slogan until you understand why it's true — and why, if you take it seriously, it changes how you think about everything else.</p>

      <h2>A Pod is not a container</h2>

      <p>Nearly every tutorial explaining what a Pod is starts with: <em>"it's a container, but with extras"</em>. It's a dangerous simplification. A Pod is not <em>a</em> container: it's a <strong>shared environment</strong> where <em>one or more</em> containers that share network, storage, and lifecycle can run.</p>

      <p>Mechanically, a Pod is a set of Linux namespaces — network, IPC, sometimes PID — that Kubernetes creates before bringing up your application containers. Those namespaces are what make the containers inside the Pod look as if they were running on the same virtual machine: they can talk over <code>localhost</code>, share volumes, see the same files. They are effectively siblings.</p>

      <p>Kubelet builds that environment with an auxiliary, nearly invisible container called <code>pause</code>, whose only job is to keep the namespaces alive while your application containers are created, die, and restart on top.</p>

      <div class="callout callout-note">
        <span class="callout-label">Deep dive</span>
        <p>All the mechanics — the <code>pause</code> container, how kubelet assembles the Pod step by step, how the CNI assigns it an IP — are covered in depth in the <a href="/tutorial/que-es-un-pod">What is a Pod?</a> tutorial. This chapter stays at the KCNA level: what you need to know to pass the exam and to have a correct mental model for working with Pods.</p>
      </div>

      <h2>Why the distinction matters</h2>

      <p>If you understood a Pod as "a container by another name", several Kubernetes facts would feel arbitrary:</p>

      <ul>
        <li>Why you can't "migrate" a container between Pods. (Because a container <em>lives inside</em> a specific set of namespaces; pulling it out of there would be destroying it.)</li>
        <li>Why all containers in a Pod share the same IP. (Because they share the network namespace.)</li>
        <li>Why killing a Pod kills <em>all</em> its containers together. (Because their lifecycle is bound to the namespaces'.)</li>
        <li>Why a sidecar "just works": it can intercept traffic or read files from the main container <em>without special permissions</em>. (Because they're in the same namespaces.)</li>
      </ul>

      <p>Once you see the Pod for what it really is — a shared namespace environment — those facts stop being weird rules and become obvious consequences.</p>

      <h2>What we'll cover in this chapter</h2>

      <ol>
        <li><strong>Anatomy of the <code>spec</code></strong>: what a Pod manifest looks like inside — containers, image, ports, env, resources, volumes.</li>
        <li><strong>Single-container vs multi-container</strong>: when it makes sense to put more than one container in a Pod and when it's a mistake.</li>
        <li><strong>Sidecars, init containers, and ambassadors</strong>: the classic patterns, with examples, plus the native sidecar that landed in 1.29.</li>
        <li><strong>Lifecycle, probes, and <code>restartPolicy</code></strong>: phases, conditions, liveness/readiness/startup, and who decides to restart what.</li>
        <li><strong>Essential commands</strong>: <code>get</code>, <code>describe</code>, <code>logs</code>, <code>exec</code> — your minimum kit to work with Pods.</li>
        <li><strong>Who manages Pods in production</strong>: Deployment, StatefulSet, DaemonSet, Job, CronJob. Spoiler: you won't create Pods by hand.</li>
      </ol>

      <p>By the end, you'll be able to read any Pod YAML, explain every field, and understand why each field is there. More importantly, you'll have the correct mental model for every chapter that follows — because every other object we'll see leans on this idea of "Pod as shared environment".</p>
    `,
}
