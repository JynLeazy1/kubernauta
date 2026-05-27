export default {
  es: `
      <p>Hemos mencionado <code>etcd</code> en casi cada sub-parte. Toca abrirlo. Porque aunque técnicamente no es "parte" de Kubernetes — es un <a href="https://etcd.io" target="_blank" rel="noopener noreferrer">proyecto CNCF graduado</a> con vida propia — sin él no hay cluster. Si borras etcd, el cluster deja de existir.</p>

      <h2>Qué es etcd</h2>

      <p><code>etcd</code> es una base de datos <strong>key-value</strong> distribuida, pensada para guardar el <em>estado de configuración</em> de sistemas distribuidos. No es una base de datos de propósito general: no corre queries complejas, no tiene joins, no soporta transacciones multi-documento. Lo que sí hace, lo hace muy bien:</p>

      <ul>
        <li>Guardar y recuperar valores por clave (tipo <code>/registry/pods/default/my-pod</code>).</li>
        <li>Garantizar consistencia fuerte: lo que acabas de escribir, lo lees.</li>
        <li>Notificar a clientes interesados cuando una clave cambia — el famoso <strong>watch</strong>.</li>
        <li>Sobrevivir a la caída de un nodo si el cluster tiene suficientes.</li>
      </ul>

      <p>Kubernetes usa esas cuatro cosas sin parar. Cada objeto que defines (Deployment, Pod, ConfigMap, …) se guarda como una clave. Cada componente (apiserver, controllers, kubelet) se suscribe a watches sobre las claves que le importan.</p>

      <h2>Raft: cómo sobrevive a fallos</h2>

      <p>Un solo nodo de etcd es un punto único de fallo. Por eso se despliega en <strong>clusters de 3 o 5 nodos</strong> que se coordinan con el algoritmo <a href="https://raft.github.io" target="_blank" rel="noopener noreferrer">Raft</a>.</p>

      <p>La idea de Raft, en pocas palabras: los nodos eligen un <em>leader</em>, todas las escrituras pasan por él, y él las replica a los demás (<em>followers</em>). Una escritura se considera exitosa solo cuando la mayoría la ha confirmado. Esa regla — mayoría — es la que define cuántos fallos soportas:</p>

      <ul>
        <li>3 nodos → tolera 1 caído (mayoría = 2).</li>
        <li>5 nodos → tolera 2 caídos (mayoría = 3).</li>
        <li>7 nodos → tolera 3 caídos, pero las escrituras se vuelven lentas por la replicación.</li>
      </ul>

      <p>Por eso en producción casi siempre ves etcd en 3 o 5 nodos. Más no ayuda: añade latencia sin aumentar significativamente la tolerancia.</p>

      <p><strong>Un detalle importante:</strong> el número de nodos siempre es impar. Con un número par no ganas nada en tolerancia y sí aumentas el costo de replicación. Con 4 nodos, la mayoría sigue siendo 3 (igual que con 5), así que es desperdicio.</p>

      <h2>El modelo watch</h2>

      <p>Este es el mecanismo que hace posible la arquitectura reactiva de Kubernetes. Un cliente le dice a etcd <em>"avísame cuando cambie cualquier clave bajo <code>/registry/pods/</code>"</em>, y etcd le manda una notificación por cada cambio — indefinidamente, hasta que el cliente cierre la conexión.</p>

      <p>El apiserver es quien hace los watches a etcd. El resto de los componentes (scheduler, kubelet, controllers) hacen watches al <em>apiserver</em>, no directamente a etcd. El apiserver actúa como un "multiplexador": recibe un watch de etcd, y lo reenvía a todos los clientes que estaban interesados.</p>

      <p>Esto mantiene etcd protegido: solo tiene un cliente real, el apiserver.</p>

      <h2>Por qué etcd es el talón de Aquiles</h2>

      <p>Todo el estado del cluster vive en etcd. Todo. Si etcd cae o se corrompe, tu cluster pierde la memoria de quién debería estar corriendo. Los Pods actuales siguen vivos en los nodos — el kubelet no los mata — pero el control plane queda ciego:</p>

      <ul>
        <li>No puedes crear ni modificar nada.</li>
        <li>Los controllers no pueden reconciliar (el apiserver no responde).</li>
        <li>Si se pierde el estado por corrupción, recuperar requiere <em>restore</em> desde un snapshot.</li>
      </ul>

      <p>Por eso <strong>hacer backups de etcd es una de las tareas más críticas</strong> de operar Kubernetes. <code>etcdctl snapshot save</code> es el comando que deberías tener programado y monitoreado en producción.</p>

      <p>El tamaño típico de etcd es pequeño (cientos de MB para clusters medianos), pero crece con la cantidad de objetos. Deployments con muchos ReplicaSets históricos, Jobs antiguos, eventos — todo cuenta.</p>

      <h2>Qué necesitas saber para la KCNA</h2>

      <p>El examen no te va a pedir que debuggees etcd, pero sí que sepas:</p>

      <ul>
        <li>Es un key-value store, no una base relacional.</li>
        <li>Usa Raft y requiere un número impar de nodos para quórum.</li>
        <li>Es la única fuente de verdad del cluster.</li>
        <li>Solo el apiserver habla con él.</li>
        <li>Es la pieza más crítica a respaldar.</li>
      </ul>

      <p>En la siguiente sub-parte cerramos el capítulo con el tema que dejamos pendiente: alta disponibilidad. ¿Qué pasa si el servidor donde corre todo el control plane — apiserver, etcd incluido — se cae?</p>
    `,
  en: `
      <p>We have mentioned <code>etcd</code> in almost every sub-part. Time to open it up. Because even though it's technically not "part of" Kubernetes — it's a <a href="https://etcd.io" target="_blank" rel="noopener noreferrer">graduated CNCF project</a> with its own life — without it there is no cluster. Delete etcd, and the cluster ceases to exist.</p>

      <h2>What etcd is</h2>

      <p><code>etcd</code> is a distributed <strong>key-value</strong> database, built to store the <em>configuration state</em> of distributed systems. It's not a general-purpose database: it doesn't run complex queries, it has no joins, it doesn't support multi-document transactions. What it does do, it does very well:</p>

      <ul>
        <li>Store and retrieve values by key (like <code>/registry/pods/default/my-pod</code>).</li>
        <li>Guarantee strong consistency: what you just wrote, you read.</li>
        <li>Notify interested clients when a key changes — the famous <strong>watch</strong>.</li>
        <li>Survive a node failure if the cluster has enough nodes.</li>
      </ul>

      <p>Kubernetes uses all four relentlessly. Every object you define (Deployment, Pod, ConfigMap, …) is stored as a key. Every component (apiserver, controllers, kubelet) subscribes to watches on the keys it cares about.</p>

      <h2>Raft: how it survives failures</h2>

      <p>A single etcd node is a single point of failure. That's why it's deployed in <strong>clusters of 3 or 5 nodes</strong> that coordinate using the <a href="https://raft.github.io" target="_blank" rel="noopener noreferrer">Raft</a> algorithm.</p>

      <p>Raft's idea, in a few words: the nodes elect a <em>leader</em>, all writes go through it, and it replicates them to the others (<em>followers</em>). A write is considered successful only when the majority has acknowledged it. That rule — majority — defines how many failures you can tolerate:</p>

      <ul>
        <li>3 nodes → tolerate 1 down (majority = 2).</li>
        <li>5 nodes → tolerate 2 down (majority = 3).</li>
        <li>7 nodes → tolerate 3 down, but writes become slow due to replication cost.</li>
      </ul>

      <p>That's why in production you almost always see etcd in 3 or 5 nodes. More doesn't help: it adds latency without a meaningful tolerance gain.</p>

      <p><strong>One important detail:</strong> the number of nodes is always odd. With an even number you gain nothing in tolerance and you do raise replication cost. With 4 nodes, majority is still 3 (same as 5), so it's waste.</p>

      <h2>The watch model</h2>

      <p>This is the mechanism that makes Kubernetes' reactive architecture possible. A client tells etcd <em>"notify me whenever any key under <code>/registry/pods/</code> changes"</em>, and etcd sends a notification per change — indefinitely, until the client closes the connection.</p>

      <p>The apiserver is the one doing watches on etcd. The other components (scheduler, kubelet, controllers) watch the <em>apiserver</em>, not etcd directly. The apiserver acts as a "multiplexer": it gets one watch from etcd and forwards it to every interested client.</p>

      <p>This keeps etcd protected: it has only one real client, the apiserver.</p>

      <h2>Why etcd is the Achilles' heel</h2>

      <p>All cluster state lives in etcd. All of it. If etcd goes down or gets corrupted, your cluster loses memory of what should be running. Current Pods stay alive on the nodes — kubelet doesn't kill them — but the control plane goes blind:</p>

      <ul>
        <li>You can't create or modify anything.</li>
        <li>Controllers can't reconcile (the apiserver isn't responding).</li>
        <li>If state is lost to corruption, recovery requires a <em>restore</em> from a snapshot.</li>
      </ul>

      <p>That's why <strong>backing up etcd is one of the most critical tasks</strong> of operating Kubernetes. <code>etcdctl snapshot save</code> is the command you should have scheduled and monitored in production.</p>

      <p>Typical etcd size is small (hundreds of MB for medium clusters), but it grows with the number of objects. Deployments with many historical ReplicaSets, old Jobs, events — everything counts.</p>

      <h2>What you need to know for the KCNA</h2>

      <p>The exam is not going to ask you to debug etcd, but it will expect you to know:</p>

      <ul>
        <li>It's a key-value store, not a relational database.</li>
        <li>It uses Raft and requires an odd number of nodes for quorum.</li>
        <li>It's the only source of truth for the cluster.</li>
        <li>Only the apiserver talks to it.</li>
        <li>It's the most critical piece to back up.</li>
      </ul>

      <p>In the next sub-part we close the chapter with the topic we left pending: high availability. What happens if the server where the entire control plane — including etcd — runs goes down?</p>
    `,
};
