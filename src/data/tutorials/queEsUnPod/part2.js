export default {
  es: `
          <p>Antes de sumergirnos en las profundidades de cómo funciona un Pod, vale la pena entender por qué existe. No nació de una decisión de diseño arbitraria — nació de un problema concreto: un solo contenedor no siempre es suficiente.</p>

          <p>Cuando Docker apareció, resolvió un problema real: <a href="/tutorial/que-es-realmente-un-contenedor/namespaces">cómo empaquetar y aislar un proceso</a>. Funcionó tan bien que la industria asumió que el contenedor era la unidad de deployment. Un proceso, una imagen, un contenedor. Simple.</p>

          <p>Pero las aplicaciones reales no son un proceso.</p>

          <p>Tomá un servidor web nginx que sirve archivos de log. Alguien tiene que rotar esos logs, comprimirlos, enviarlos a un sistema centralizado. Puedes meter esa lógica dentro del mismo contenedor, pero entonces estás mezclando responsabilidades: la imagen de nginx ahora tiene Fluentd adentro, se actualiza cuando cualquiera de los dos cambia, y si el shipper de logs crashea se lleva a nginx con él.</p>

          <p>La alternativa obvia es dos contenedores separados. Pero ahí aparece el problema: ¿cómo comparten los archivos de log? ¿Por red? ¿Con un volumen montado en los dos? ¿Y cómo garantizas que siempre corren en el mismo nodo, que tienen acceso al mismo filesystem local, que si uno se mueve el otro lo sigue?</p>

          <p>Docker Compose resolvió esto parcialmente, pero solo en un nodo. En un cluster de cientos de máquinas, necesitas que el scheduler sepa que estos dos contenedores son una unidad atómica: se colocan juntos, se schedulan juntos, y se reemplazan juntos.</p>

          <p>Ese es el problema que resuelve el Pod.</p>

          <p>No es una abstracción inventada para agregar una capa más. Es la respuesta a una pregunta concreta: ¿cuál es la unidad mínima de co-localización? ¿Qué grupo de procesos tiene tanta cohesión que separarlos no tiene sentido?</p>

          <p>La respuesta de Kubernetes fue: procesos que necesitan compartir red y storage. Eso y solo eso define el límite del Pod. Todo lo que puede vivir en Pods separados, debería hacerlo. Todo lo que necesita la misma interfaz de red o el mismo volumen local, va en el mismo Pod.</p>

          <p>Y para implementar eso a nivel de kernel, Kubernetes necesitó una pieza que no viene en ningún YAML: el contenedor <code>pause</code>.</p>
        `,
  en: `
          <p>Before diving into the depths of how a Pod works, it is worth understanding why it exists. It was not born from an arbitrary design decision — it was born from a concrete problem: a single container is not always enough.</p>

          <p>When Docker appeared, it solved a real problem: <a href="/tutorial/que-es-realmente-un-contenedor/namespaces">how to package and isolate a process</a>. It worked so well that the industry assumed the container was the unit of deployment. One process, one image, one container. Simple.</p>

          <p>But real applications are not a single process.</p>

          <p>Take an nginx web server that writes log files. Someone has to rotate those logs, compress them, ship them to a centralized system. You could put that logic inside the same container, but then you are mixing responsibilities: the nginx image now has Fluentd inside it, it gets updated whenever either one changes, and if the log shipper crashes it takes nginx down with it.</p>

          <p>The obvious alternative is two separate containers. But that is where the problem appears: how do they share the log files? Over the network? With a volume mounted in both? And how do you guarantee they always run on the same node, that they have access to the same local filesystem, that if one moves the other follows?</p>

          <p>Docker Compose solved this partially, but only on a single node. In a cluster of hundreds of machines, you need the scheduler to know that these two containers are an atomic unit: placed together, scheduled together, and replaced together.</p>

          <p>That is the problem the Pod solves.</p>

          <p>It is not an abstraction invented to add another layer. It is the answer to a concrete question: what is the minimum unit of co-location? Which group of processes has such cohesion that separating them makes no sense?</p>

          <p>Kubernetes' answer was: processes that need to share network and storage. That and only that defines the Pod boundary. Everything that can live in separate Pods should. Everything that needs the same network interface or the same local volume goes in the same Pod.</p>

          <p>And to implement that at the kernel level, Kubernetes needed a piece that does not appear in any YAML: the <code>pause</code> container.</p>
        `,
}
