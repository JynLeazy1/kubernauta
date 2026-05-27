export default {
  es: `
      <p>En la parte anterior dijimos que el control plane no es una entidad mágica: son cuatro procesos. Vamos a ver quiénes son y por qué están separados — porque ese "por qué" es la mitad del entendimiento.</p>

      <p>Los cuatro procesos del control plane son:</p>

      <ul>
        <li><code>kube-apiserver</code> — la puerta de entrada.</li>
        <li><code>etcd</code> — la memoria.</li>
        <li><code>kube-scheduler</code> — el asignador.</li>
        <li><code>kube-controller-manager</code> — los vigilantes.</li>
      </ul>

      <p>Y una regla que cambia todo: <strong>ninguno de esos procesos se habla directamente con los demás excepto el apiserver</strong>. Todo pasa por el apiserver. Todo. Si el scheduler quiere saber qué Pods no tienen nodo asignado, no lee etcd — le pregunta al apiserver. Si el controller-manager quiere crear un Pod, no lo escribe en etcd — le dice al apiserver que lo haga. Esta regla, que parece burocrática, es la que mantiene el sistema consistente.</p>

      <h2>kube-apiserver: la puerta</h2>

      <p>El <code>kube-apiserver</code> es un servidor HTTP. Literalmente. Expone una REST API sobre TLS en el puerto 6443. Cuando ejecutas <code>kubectl get pods</code>, <code>kubectl</code> le hace un <code>GET</code> al apiserver. Cuando aplicas un YAML, le hace un <code>POST</code> o un <code>PUT</code>.</p>

      <p>Su trabajo real no es solo "recibir peticiones". Es:</p>

      <ul>
        <li><strong>Autenticar</strong> quién eres (token, cert, OIDC).</li>
        <li><strong>Autorizar</strong> qué puedes hacer (normalmente vía RBAC — lo vemos en el <a href="/course/kubernetes-for-beginners/security-rbac-serviceaccounts">capítulo 14</a>).</li>
        <li><strong>Validar</strong> que el objeto que mandas sea sintácticamente correcto.</li>
        <li><strong>Pasar por admission controllers</strong> que pueden modificar o rechazar el objeto.</li>
        <li><strong>Persistir</strong> en etcd si todo pasa los filtros.</li>
      </ul>

      <p>Si el apiserver se cae, el cluster no "se rompe" — los Pods que ya corren siguen corriendo. Pero no puedes ver su estado, ni crear nada nuevo, ni cambiar nada. Es como si un restaurante se quedara sin meseros: los comensales que ya tienen su comida pueden seguir comiendo tranquilos, pero nadie puede pedir algo nuevo, cambiar su orden, ni preguntarle a la cocina cómo van los platillos.</p>

      <h2>etcd: la memoria</h2>

      <p>Aunque etcd técnicamente no es un proceso "de Kubernetes" (es un proyecto CNCF independiente), en la práctica es parte del control plane. Es la base de datos <em>key-value</em> donde vive absolutamente todo el estado del cluster: cada Pod, cada Deployment, cada Secret, cada ConfigMap. Si borras etcd, borras el cluster.</p>

      <p>Dos cosas lo hacen especial:</p>

      <ol>
        <li>Usa el algoritmo <strong>Raft</strong> para consenso. Eso significa que puede correr en 3 o 5 nodos y sobrevivir si uno se cae — siempre que la mayoría siga viva.</li>
        <li>Soporta un modelo <em>watch</em>: los clientes pueden suscribirse a cambios en una clave y recibir notificaciones cuando cambie. Kubernetes usa esto sin parar.</li>
      </ol>

      <p>Le dedicamos una sub-parte completa más adelante porque etcd merece atención. Por ahora: piénsalo como la única fuente de verdad del cluster, accesible solo a través del apiserver.</p>

      <h2>kube-scheduler: el asignador</h2>

      <p>El scheduler tiene un trabajo muy específico: <strong>asignar Pods a nodos</strong>. Nada más.</p>

      <p>Cuando creas un Pod, el apiserver lo guarda en etcd con un campo <code>spec.nodeName</code> vacío. El scheduler, que está <em>vigilando</em> (via watch) los Pods sin nodo asignado, lo ve, y decide: <em>"este Pod debería correr en el nodo X"</em>. Toma esa decisión y le pide al apiserver que actualice el Pod con <code>spec.nodeName: X</code>.</p>

      <p>Ojo con este detalle: <strong>el scheduler no arranca el Pod</strong>. Solo decide dónde va. Quien lo arranca es el <code>kubelet</code> del nodo elegido, y lo explicamos en la siguiente sub-parte.</p>

      <p>La decisión del scheduler tiene dos fases: <em>filtering</em> (qué nodos son válidos — tienen recursos, cumplen con taints, afinidades, etc.) y <em>scoring</em> (de los válidos, cuál es el mejor). Lo profundizamos en el <a href="/course/kubernetes-for-beginners/scheduling">capítulo 8</a>.</p>

      <h2>kube-controller-manager: los vigilantes</h2>

      <p>Este componente es realmente un binario que, por dentro, corre <strong>muchos controllers distintos</strong>: el <em>Deployment controller</em>, el <em>ReplicaSet controller</em>, el <em>Node controller</em>, el <em>Job controller</em>, y varios más. Se juntan en un solo proceso por eficiencia, pero cada uno es independiente.</p>

      <p>Todos los controllers hacen lo mismo a alto nivel: un <strong>loop de reconciliación</strong>.</p>

      <pre><code>while True:
    actual = api.get_current_state()
    desired = api.get_desired_state()
    if actual != desired:
        api.apply_diff(desired - actual)</code></pre>

      <p class="source-note">Pseudocódigo ilustrativo. El patrón formal está descrito en la documentación oficial: <a href="https://kubernetes.io/docs/concepts/architecture/controller/" target="_blank" rel="noopener noreferrer">kubernetes.io — Controllers</a>.</p>

      <p>El <em>ReplicaSet controller</em>, por ejemplo, vigila ReplicaSets. Si dices "quiero 3 réplicas" y solo hay 2 Pods, crea un tercero. Si hay 4, mata uno. Y sigue vigilando, para siempre.</p>

      <p>Esta es la esencia declarativa de Kubernetes: no ordenas "crea este Pod"; declaras <em>"quiero este estado"</em>, y un controller lo mantiene así.</p>

      <h2>¿Por qué están separados?</h2>

      <p>Podrías meter todos estos procesos en un solo binario. ¿Por qué no lo hacen? Tres razones:</p>

      <ol>
        <li><strong>Aislamiento de fallos</strong>: si el scheduler entra en un bug que lo bloquea, el apiserver sigue respondiendo. Puedes seguir leyendo el estado mientras diagnosticas.</li>
        <li><strong>Escalabilidad independiente</strong>: el apiserver tiene cargas muy distintas a las del scheduler. Separarlos permite afinarlos por separado.</li>
        <li><strong>Claridad del modelo</strong>: el apiserver es la única fuente de verdad de la comunicación. Los demás componentes son <em>clientes</em> del apiserver, exactamente igual que <code>kubectl</code>. Esa simetría simplifica todo.</li>
      </ol>

      <p>En el siguiente paso bajamos al otro lado del cluster: los nodos worker, donde finalmente corren tus contenedores.</p>
    `,
  en: `
      <p>In the previous part we said the control plane is not a magical entity: it's four processes. Let's see who they are and why they are separate — because that "why" is half the understanding.</p>

      <p>The four control plane processes are:</p>

      <ul>
        <li><code>kube-apiserver</code> — the entry point.</li>
        <li><code>etcd</code> — the memory.</li>
        <li><code>kube-scheduler</code> — the assigner.</li>
        <li><code>kube-controller-manager</code> — the watchers.</li>
      </ul>

      <p>And a rule that changes everything: <strong>none of those processes talk to each other directly except through the apiserver</strong>. Everything goes through the apiserver. Everything. If the scheduler wants to know which Pods have no node assigned, it doesn't read etcd — it asks the apiserver. If the controller-manager wants to create a Pod, it doesn't write to etcd — it tells the apiserver to do it. This rule, which looks bureaucratic, is what keeps the system consistent.</p>

      <h2>kube-apiserver: the door</h2>

      <p>The <code>kube-apiserver</code> is an HTTP server. Literally. It exposes a REST API over TLS on port 6443. When you run <code>kubectl get pods</code>, <code>kubectl</code> sends a <code>GET</code> to the apiserver. When you apply a YAML, it sends a <code>POST</code> or <code>PUT</code>.</p>

      <p>Its real job is not just "receiving requests". It is to:</p>

      <ul>
        <li><strong>Authenticate</strong> who you are (token, cert, OIDC).</li>
        <li><strong>Authorize</strong> what you can do (usually via RBAC — we cover it in <a href="/course/kubernetes-for-beginners/security-rbac-serviceaccounts">chapter 14</a>).</li>
        <li><strong>Validate</strong> that the object you send is syntactically correct.</li>
        <li><strong>Run admission controllers</strong> that may mutate or reject the object.</li>
        <li><strong>Persist</strong> to etcd if everything passes.</li>
      </ul>

      <p>If the apiserver goes down, the cluster doesn't "break" — Pods that are already running keep running. But you can't see their state, can't create anything new, can't change anything. It's like a restaurant running out of waiters: the diners who already have their food keep eating just fine, but nobody can place a new order, change an existing one, or ask the kitchen how things are going.</p>

      <h2>etcd: the memory</h2>

      <p>Although etcd is technically not a "Kubernetes" process (it's an independent CNCF project), in practice it is part of the control plane. It's the <em>key-value</em> database where every piece of cluster state lives: every Pod, every Deployment, every Secret, every ConfigMap. If you delete etcd, you delete the cluster.</p>

      <p>Two things make it special:</p>

      <ol>
        <li>It uses the <strong>Raft</strong> consensus algorithm. That means it can run on 3 or 5 nodes and survive if one fails — as long as the majority is alive.</li>
        <li>It supports a <em>watch</em> model: clients can subscribe to changes on a key and be notified when it changes. Kubernetes uses this relentlessly.</li>
      </ol>

      <p>We dedicate a whole sub-part to etcd later because it deserves the attention. For now: think of it as the only source of truth for the cluster, reachable only through the apiserver.</p>

      <h2>kube-scheduler: the assigner</h2>

      <p>The scheduler has a very specific job: <strong>assign Pods to nodes</strong>. Nothing more.</p>

      <p>When you create a Pod, the apiserver stores it in etcd with an empty <code>spec.nodeName</code> field. The scheduler, which is <em>watching</em> (via watch) Pods with no node assigned, sees it and decides: <em>"this Pod should run on node X"</em>. It makes that decision and asks the apiserver to update the Pod with <code>spec.nodeName: X</code>.</p>

      <p>Watch this detail: <strong>the scheduler does not start the Pod</strong>. It only decides where it should go. Whoever starts it is the <code>kubelet</code> of the chosen node, which we'll explain in the next sub-part.</p>

      <p>The scheduler's decision has two phases: <em>filtering</em> (which nodes are valid — they have resources, match taints, affinities, etc.) and <em>scoring</em> (of the valid ones, which is best). We go deep into this in <a href="/course/kubernetes-for-beginners/scheduling">chapter 8</a>.</p>

      <h2>kube-controller-manager: the watchers</h2>

      <p>This component is actually a binary that, inside, runs <strong>many distinct controllers</strong>: the <em>Deployment controller</em>, the <em>ReplicaSet controller</em>, the <em>Node controller</em>, the <em>Job controller</em>, and several more. They are bundled into a single process for efficiency, but each one is independent.</p>

      <p>All controllers do the same thing at a high level: a <strong>reconciliation loop</strong>.</p>

      <pre><code>while True:
    actual = api.get_current_state()
    desired = api.get_desired_state()
    if actual != desired:
        api.apply_diff(desired - actual)</code></pre>

      <p class="source-note">Illustrative pseudocode. The formal pattern is described in the official docs: <a href="https://kubernetes.io/docs/concepts/architecture/controller/" target="_blank" rel="noopener noreferrer">kubernetes.io — Controllers</a>.</p>

      <p>The <em>ReplicaSet controller</em>, for example, watches ReplicaSets. If you say "I want 3 replicas" and there are only 2 Pods, it creates a third one. If there are 4, it kills one. And it keeps watching, forever.</p>

      <p>This is the declarative essence of Kubernetes: you don't order "create this Pod"; you declare <em>"I want this state"</em>, and a controller keeps it that way.</p>

      <h2>Why are they separated?</h2>

      <p>You could stuff all these processes into a single binary. Why don't they? Three reasons:</p>

      <ol>
        <li><strong>Failure isolation</strong>: if the scheduler hits a bug and hangs, the apiserver keeps responding. You can still read state while you diagnose.</li>
        <li><strong>Independent scalability</strong>: the apiserver has very different load patterns than the scheduler. Separating them lets you tune each one independently.</li>
        <li><strong>Model clarity</strong>: the apiserver is the single source of truth for communication. All other components are <em>clients</em> of the apiserver, exactly like <code>kubectl</code>. That symmetry simplifies everything.</li>
      </ol>

      <p>In the next step we go to the other side of the cluster: the worker nodes, where your containers actually run.</p>
    `,
};
