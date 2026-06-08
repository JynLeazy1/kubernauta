export default {
  es: `
          <p>Seguramente lo has visto mil veces. En cada tutorial de Kubernetes, en cada curso, en cada documentación: <em>"un Pod no es un contenedor"</em>, <em>"es la <a href="https://kubernetes.io/docs/concepts/workloads/pods/" target="_blank" rel="noopener noreferrer">unidad mínima deployable</a> en Kubernetes"</em>, <em>"un Pod puede tener varios contenedores"</em>. Lo sabes de memoria. Y si eres como yo y te gusta entender cómo funcionan las cosas a fondo — qué es lo que realmente sucede, cómo Linux crea esos Pods, qué pasa exactamente bajo el capó cuando kubelet recibe la instrucción de levantar uno, y por qué eso lo hace fundamentalmente diferente a un contenedor — sigue leyendo, que justamente de eso trata este tutorial.</p>

          <p>No vamos a quedarnos en la definición. Vamos a abrir el Pod, ver cada pieza que lo compone, entender por qué existe cada una, y llegar al punto en que cuando alguien te diga <em>"un Pod es la unidad mínima de Kubernetes"</em> puedas responder <em>"sí, y aquí está exactamente por qué"</em>.</p>

          <h2>Lo que ya sabes... y lo que falta</h2>

          <p>Si venías del <em><a href="/tutorial/que-es-realmente-un-contenedor">tutorial anterior sobre contenedores</a></em>, tienes la base perfecta: sabes que un contenedor es un proceso Linux con namespaces y cgroups, que el filesystem viene de un OverlayFS, y que el aislamiento es una ilusión que construye el kernel. Eso es exactamente lo que vamos a usar ahora.</p>

          <p>Un Pod no reemplaza a esa abstracción. La extiende. La pregunta que responde es distinta:</p>

          <ul>
            <li>Un contenedor responde: <strong>¿cómo aíslo un proceso?</strong></li>
            <li>Un Pod responde: <strong>¿cómo agropo procesos que necesitan vivir juntos?</strong></li>
          </ul>

          <p>Y "vivir juntos" no es una metáfora — es literal. Significa compartir el mismo namespace de red, la misma IP, el mismo hostname. Significa que si uno muere y se reinicia, los demás no pierden su conexión de red. Significa que hay un proceso invisible, llamado <code>pause</code>, cuyo único trabajo es mantener esos namespaces vivos mientras los contenedores de la aplicación hacen lo suyo.</p>

          <h2>Lo que vamos a ver</h2>

          <p>Vamos a diseccionar un Pod desde adentro hacia afuera:</p>

          <ol>
            <li><strong>Anatomía:</strong> qué campos tiene el spec y qué instrucciones le dan realmente al kernel.</li>
            <li><strong>El contenedor pause:</strong> el ancla de los namespaces compartidos sin la que un Pod no puede existir.</li>
            <li><strong>Multi-contenedor:</strong> sidecars e init containers, no como patrones de diseño sino como consecuencias directas del modelo de namespaces.</li>
            <li><strong>Red:</strong> por qué todos los contenedores de un Pod se hablan por localhost, y qué significa eso en términos de kernel.</li>
            <li><strong>Ciclo de vida:</strong> fases, condiciones, probes y restartPolicy — qué ve Kubernetes y qué ve el kernel.</li>
          </ol>

          <p>Al terminar, un Pod va a dejar de ser una definición que recitas y va a pasar a ser algo que entiendes.</p>
        `,
  en: `
          <p>You have probably seen it a thousand times. In every Kubernetes tutorial, every course, every piece of documentation: <em>"a Pod is not a container"</em>, <em>"it is the <a href="https://kubernetes.io/docs/concepts/workloads/pods/" target="_blank" rel="noopener noreferrer">smallest deployable unit</a> in Kubernetes"</em>, <em>"a Pod can have multiple containers"</em>. You know it by heart. And if you are like me and you like to understand how things actually work under the hood — what really happens, how Linux creates those Pods, what unfolds when kubelet gets the instruction to spin one up, and why that makes it fundamentally different from a container — keep reading, because that is exactly what this tutorial is about.</p>

          <p>We are not going to stop at the definition. We are going to open up a Pod, look at every piece that makes it up, understand why each one exists, and get to the point where when someone tells you <em>"a Pod is the smallest unit in Kubernetes"</em> you can answer <em>"yes, and here is exactly why"</em>.</p>

          <h2>What you already know... and what is missing</h2>

          <p>If you came from the <em><a href="/tutorial/que-es-realmente-un-contenedor">previous tutorial about containers</a></em>, you have the perfect foundation: you know that a container is a Linux process with namespaces and cgroups, that the filesystem comes from an OverlayFS, and that isolation is an illusion built by the kernel. That is exactly what we are going to use now.</p>

          <p>A Pod does not replace that abstraction. It extends it. The question it answers is different:</p>

          <ul>
            <li>A container answers: <strong>how do I isolate a process?</strong></li>
            <li>A Pod answers: <strong>how do I group processes that need to live together?</strong></li>
          </ul>

          <p>And "live together" is not a metaphor — it is literal. It means sharing the same network namespace, the same IP, the same hostname. It means that if one container dies and restarts, the others do not lose their network connection. It means there is an invisible process, called <code>pause</code>, whose only job is to keep those namespaces alive while the application containers do their thing.</p>

          <h2>What we are going to cover</h2>

          <p>We are going to dissect a Pod from the inside out:</p>

          <ol>
            <li><strong>Anatomy:</strong> what fields the spec has and what instructions they actually give the kernel.</li>
            <li><strong>The pause container:</strong> the anchor of the shared namespaces without which a Pod cannot exist.</li>
            <li><strong>Multi-container:</strong> sidecars and init containers, not as design patterns but as direct consequences of the namespace model.</li>
            <li><strong>Networking:</strong> why all containers in a Pod talk to each other via localhost, and what that means in kernel terms.</li>
            <li><strong>Lifecycle:</strong> phases, conditions, probes, and restartPolicy — what Kubernetes sees and what the kernel sees.</li>
          </ol>

          <p>By the end, a Pod will stop being a definition you recite and become something you actually understand.</p>
        `,
}
