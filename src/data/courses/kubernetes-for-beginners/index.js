const kubernetesForBeginners = {
  id: 1,
  slug: "kubernetes-for-beginners",
  loadSubpart: (chapterOrder, subOrder) =>
    import(`./ch${chapterOrder}/part${subOrder}.js`),
  title: {
    es: "Kubernetes para principiantes",
    en: "Kubernetes for Beginners",
  },
  subtitle: {
    es: "Los conceptos fundamentales para la KCNA y más allá",
    en: "The core concepts for the KCNA and beyond",
  },
  description: {
    es: "Curso completo orientado a la certificación KCNA. Cubre los cinco dominios oficiales — fundamentos de Kubernetes, orquestación de contenedores, ecosistema cloud native, observabilidad y entrega de aplicaciones — con el mismo estilo profundo del resto de la plataforma: entender cada pieza desde adentro, no solo recitar definiciones.",
    en: "A full course aimed at the KCNA certification. Covers the five official domains — Kubernetes fundamentals, container orchestration, cloud native ecosystem, observability, and application delivery — in the same deep style as the rest of the platform: understanding every piece from the inside out, not just reciting definitions.",
  },
  tags: [
    "kubernetes",
    "kcna",
    "cloud-native",
    "cncf",
    "containers",
    "beginners",
  ],
  wip: true,
  parts: [
    // ─────────────────────────────────────────────────────────────
    // BLOQUE I — Fundamentos
    // ─────────────────────────────────────────────────────────────
    {
      order: 1,
      slug: "architecture",
      title: {
        es: "Arquitectura de Kubernetes: plano de control, nodos y el flujo de una petición",
        en: "Kubernetes Architecture: Control Plane, Nodes, and the Request Flow",
      },
      subparts: [
        {
          order: 1,
          slug: "introduccion",
          title: {
            es: "Introducción: qué es realmente un cluster",
            en: "Introduction: What a Cluster Really Is",
          },
        },
        {
          order: 2,
          slug: "control-plane",
          title: {
            es: "El plano de control: apiserver, etcd, scheduler, controller-manager",
            en: "The Control Plane: apiserver, etcd, scheduler, controller-manager",
          },
        },
        {
          order: 3,
          slug: "worker-nodes",
          title: {
            es: "Los nodos worker: kubelet, kube-proxy y el runtime",
            en: "Worker Nodes: kubelet, kube-proxy, and the Runtime",
          },
        },
        {
          order: 4,
          slug: "flujo-de-una-peticion",
          title: {
            es: "El flujo de una petición: de kubectl apply a contenedor corriendo",
            en: "The Request Flow: From kubectl apply to Running Container",
          },
        },
        {
          order: 5,
          slug: "etcd-la-fuente-de-verdad",
          title: {
            es: "etcd: la fuente de verdad del cluster",
            en: "etcd: The Cluster's Source of Truth",
          },
        },
        {
          order: 6,
          slug: "alta-disponibilidad",
          title: {
            es: "Alta disponibilidad: por qué el plano de control no es una sola máquina",
            en: "High Availability: Why the Control Plane Is Not a Single Machine",
          },
        },
        {
          order: 7,
          slug: "resumen",
          title: {
            es: "Resumen: el mapa mental completo",
            en: "Summary: The Complete Mental Map",
          },
        },
      ],
    },
    {
      order: 2,
      slug: "api-and-declarative-model",
      title: {
        es: "La API de Kubernetes y el modelo declarativo",
        en: "The Kubernetes API and the Declarative Model",
      },
      subparts: [
        {
          order: 1,
          slug: "introduccion",
          title: {
            es: "Introducción: el contrato declarativo",
            en: "Introduction: The Declarative Contract",
          },
        },
        {
          order: 2,
          slug: "objetos-y-reconciliacion",
          title: {
            es: "Objetos, recursos y el loop de reconciliación",
            en: "Objects, Resources, and the Reconciliation Loop",
          },
        },
        {
          order: 3,
          slug: "grupos-y-versiones",
          title: {
            es: "Grupos de API, versiones y anatomía de un objeto",
            en: "API Groups, Versions, and the Anatomy of an Object",
          },
        },
        {
          order: 4,
          slug: "controllers",
          title: {
            es: "Controllers: el patrón que hace todo funcionar",
            en: "Controllers: The Pattern That Makes Everything Work",
          },
        },
        {
          order: 5,
          slug: "crds-y-extensibilidad",
          title: {
            es: "CRDs y extensibilidad: la API no es fija",
            en: "CRDs and Extensibility: The API Is Not Fixed",
          },
        },
        {
          order: 6,
          slug: "kubectl-y-server-side-apply",
          title: {
            es: "kubectl, --dry-run y server-side apply",
            en: "kubectl, --dry-run, and Server-Side Apply",
          },
        },
        {
          order: 7,
          slug: "resumen",
          title: {
            es: "Resumen: por qué el modelo declarativo importa para la KCNA",
            en: "Summary: Why the Declarative Model Matters for the KCNA",
          },
        },
      ],
    },
    {
      order: 3,
      slug: "pods",
      title: {
        es: "Entendiendo los Pods de Kubernetes",
        en: "Understanding Kubernetes Pods",
      },
      subparts: [
        {
          order: 1,
          slug: "introduccion",
          title: {
            es: "Introducción: un Pod no es un contenedor",
            en: "Introduction: A Pod Is Not a Container",
          },
        },
        {
          order: 2,
          slug: "anatomia-del-spec",
          title: {
            es: "Anatomía del spec: lo que realmente declaras",
            en: "Spec Anatomy: What You Are Actually Declaring",
          },
        },
        {
          order: 3,
          slug: "single-vs-multi-contenedor",
          title: {
            es: "Pods de un solo contenedor vs multi-contenedor",
            en: "Single-Container vs Multi-Container Pods",
          },
        },
        {
          order: 4,
          slug: "sidecars-e-init-containers",
          title: {
            es: "Sidecars, init containers y ambassadors",
            en: "Sidecars, Init Containers, and Ambassadors",
          },
        },
        {
          order: 5,
          slug: "ciclo-de-vida",
          title: {
            es: "Ciclo de vida: fases, probes y restartPolicy",
            en: "Lifecycle: Phases, Probes, and restartPolicy",
          },
        },
        {
          order: 6,
          slug: "comandos-esenciales",
          title: {
            es: "Comandos esenciales: get, describe, logs, exec",
            en: "Essential Commands: get, describe, logs, exec",
          },
        },
        {
          order: 7,
          slug: "quien-gestiona-pods-en-produccion",
          title: {
            es: "Quién gestiona Pods en producción (Deployments, StatefulSets, Jobs)",
            en: "Who Manages Pods in Production (Deployments, StatefulSets, Jobs)",
          },
        },
        {
          order: 8,
          slug: "resumen",
          title: {
            es: "Resumen: el Pod como unidad mínima",
            en: "Summary: The Pod as the Minimum Unit",
          },
        },
      ],
    },
    {
      order: 4,
      slug: "replicasets-and-deployments",
      title: {
        es: "ReplicaSets y Deployments: mantener tu app viva",
        en: "ReplicaSets and Deployments: Keeping Your App Alive",
      },
      subparts: [
        {
          order: 1,
          slug: "introduccion",
          title: {
            es: "Introducción: por qué no usas Pods directamente",
            en: "Introduction: Why You Don't Use Pods Directly",
          },
        },
        {
          order: 2,
          slug: "replicaset",
          title: {
            es: "ReplicaSet: el loop que mantiene N réplicas",
            en: "ReplicaSet: The Loop That Keeps N Replicas",
          },
        },
        {
          order: 3,
          slug: "deployment",
          title: {
            es: "Deployment: una capa sobre ReplicaSet",
            en: "Deployment: A Layer on Top of ReplicaSet",
          },
        },
        {
          order: 4,
          slug: "labels-y-selectors",
          title: {
            es: "Labels y selectors: el pegamento del modelo",
            en: "Labels and Selectors: The Glue of the Model",
          },
        },
        {
          order: 5,
          slug: "escalar-y-actualizar",
          title: {
            es: "Escalar y actualizar: comandos básicos",
            en: "Scaling and Updating: The Basic Commands",
          },
        },
        {
          order: 6,
          slug: "rollback-y-revisiones",
          title: {
            es: "Rollback y revisiones",
            en: "Rollback and Revisions",
          },
        },
        {
          order: 7,
          slug: "resumen",
          title: {
            es: "Resumen: Pod → ReplicaSet → Deployment",
            en: "Summary: Pod → ReplicaSet → Deployment",
          },
        },
      ],
    },
    {
      order: 5,
      slug: "configmaps-secrets",
      title: {
        es: "ConfigMaps y Secrets: configuración en Kubernetes",
        en: "ConfigMaps and Secrets: Configuration in Kubernetes",
      },
      subparts: [
        {
          order: 1,
          slug: "introduccion",
          title: {
            es: "Introducción: separar configuración del código",
            en: "Introduction: Separating Config from Code",
          },
        },
        {
          order: 2,
          slug: "configmap",
          title: {
            es: "ConfigMap: formas de crearlo y consumirlo",
            en: "ConfigMap: Ways to Create and Consume It",
          },
        },
        {
          order: 3,
          slug: "secret",
          title: {
            es: "Secret: qué es (y qué no es) \"secreto\"",
            en: "Secret: What Is (and Isn't) \"Secret\"",
          },
        },
        {
          order: 4,
          slug: "volumenes-vs-env",
          title: {
            es: "Montaje como volumen vs variables de entorno",
            en: "Volume Mount vs Environment Variables",
          },
        },
        {
          order: 5,
          slug: "actualizacion",
          title: {
            es: "Actualización: qué pasa cuando cambia",
            en: "Updates: What Happens When They Change",
          },
        },
        {
          order: 6,
          slug: "limites-y-alternativas",
          title: {
            es: "Límites y alternativas: external-secrets, sealed-secrets",
            en: "Limits and Alternatives: external-secrets, sealed-secrets",
          },
        },
        {
          order: 7,
          slug: "resumen",
          title: {
            es: "Resumen",
            en: "Summary",
          },
        },
      ],
    },
    {
      order: 6,
      slug: "namespaces",
      title: {
        es: "Namespaces: aislamiento y organización de recursos",
        en: "Namespaces: Isolation and Resource Organization",
      },
      subparts: [
        {
          order: 1,
          slug: "introduccion",
          title: {
            es: "Introducción: el problema que resuelven",
            en: "Introduction: The Problem They Solve",
          },
        },
        {
          order: 2,
          slug: "namespaces-por-defecto",
          title: {
            es: "Los namespaces por defecto: default, kube-system, kube-public",
            en: "Default Namespaces: default, kube-system, kube-public",
          },
        },
        {
          order: 3,
          slug: "crear-y-listar",
          title: {
            es: "Crear, listar y cambiar de namespace",
            en: "Create, List, and Switch Namespaces",
          },
        },
        {
          order: 4,
          slug: "recursos-namespaced-vs-cluster",
          title: {
            es: "Recursos con namespace vs cluster-scoped",
            en: "Namespaced vs Cluster-Scoped Resources",
          },
        },
        {
          order: 5,
          slug: "resourcequota-y-limitrange",
          title: {
            es: "ResourceQuota y LimitRange: controlar el consumo",
            en: "ResourceQuota and LimitRange: Controlling Consumption",
          },
        },
        {
          order: 6,
          slug: "networkpolicy",
          title: {
            es: "NetworkPolicy: aislamiento entre namespaces",
            en: "NetworkPolicy: Isolation Between Namespaces",
          },
        },
        {
          order: 7,
          slug: "resumen",
          title: {
            es: "Resumen",
            en: "Summary",
          },
        },
      ],
    },
    // ─────────────────────────────────────────────────────────────
    // BLOQUE II — Orquestación de contenedores
    // ─────────────────────────────────────────────────────────────
    {
      order: 7,
      slug: "container-runtimes-and-cri",
      title: {
        es: "Runtimes y la CRI: del YAML al proceso en el kernel",
        en: "Runtimes and the CRI: From YAML to Kernel Process",
      },
      subparts: [
        {
          order: 1,
          slug: "introduccion",
          title: {
            es: "Introducción: qué ejecuta realmente tus contenedores",
            en: "Introduction: What Actually Runs Your Containers",
          },
        },
        {
          order: 2,
          slug: "runc-containerd-crio",
          title: {
            es: "runc, containerd y CRI-O: las piezas",
            en: "runc, containerd, and CRI-O: The Pieces",
          },
        },
        {
          order: 3,
          slug: "cri",
          title: {
            es: "La Container Runtime Interface (CRI) y su propósito",
            en: "The Container Runtime Interface (CRI) and Its Purpose",
          },
        },
        {
          order: 4,
          slug: "kubelet-al-runtime",
          title: {
            es: "El camino de kubelet al runtime",
            en: "The Path from kubelet to the Runtime",
          },
        },
        {
          order: 5,
          slug: "oci",
          title: {
            es: "OCI: imágenes y runtime-spec",
            en: "OCI: Images and Runtime-Spec",
          },
        },
        {
          order: 6,
          slug: "resumen",
          title: {
            es: "Resumen",
            en: "Summary",
          },
        },
      ],
    },
    {
      order: 8,
      slug: "scheduling",
      title: {
        es: "Scheduling: cómo Kubernetes decide dónde corre un Pod",
        en: "Scheduling: How Kubernetes Decides Where a Pod Runs",
      },
      subparts: [
        {
          order: 1,
          slug: "introduccion",
          title: {
            es: "Introducción: el scheduler y su trabajo",
            en: "Introduction: The Scheduler and Its Job",
          },
        },
        {
          order: 2,
          slug: "filtering-y-scoring",
          title: {
            es: "Las dos fases: filtering y scoring",
            en: "The Two Phases: Filtering and Scoring",
          },
        },
        {
          order: 3,
          slug: "nodeselector",
          title: {
            es: "nodeSelector: el match más simple",
            en: "nodeSelector: The Simplest Match",
          },
        },
        {
          order: 4,
          slug: "taints-y-tolerations",
          title: {
            es: "Taints y tolerations: nodos exclusivos",
            en: "Taints and Tolerations: Exclusive Nodes",
          },
        },
        {
          order: 5,
          slug: "affinity-y-antiaffinity",
          title: {
            es: "Affinity y anti-affinity: reglas más finas",
            en: "Affinity and Anti-Affinity: Finer Rules",
          },
        },
        {
          order: 6,
          slug: "priority-y-preemption",
          title: {
            es: "PriorityClass y preemption",
            en: "PriorityClass and Preemption",
          },
        },
        {
          order: 7,
          slug: "resumen",
          title: {
            es: "Resumen",
            en: "Summary",
          },
        },
      ],
    },
    {
      order: 9,
      slug: "services",
      title: {
        es: "Services en Kubernetes: ClusterIP, NodePort y LoadBalancer",
        en: "Kubernetes Services: ClusterIP, NodePort, and LoadBalancer",
      },
      subparts: [
        {
          order: 1,
          slug: "introduccion",
          title: {
            es: "Introducción: los Pods son efímeros, las Services no",
            en: "Introduction: Pods Are Ephemeral, Services Are Not",
          },
        },
        {
          order: 2,
          slug: "clusterip",
          title: {
            es: "ClusterIP: la dirección interna estable",
            en: "ClusterIP: The Stable Internal Address",
          },
        },
        {
          order: 3,
          slug: "nodeport",
          title: {
            es: "NodePort: exponer en cada nodo",
            en: "NodePort: Exposing on Every Node",
          },
        },
        {
          order: 4,
          slug: "loadbalancer",
          title: {
            es: "LoadBalancer: integración con el cloud",
            en: "LoadBalancer: Cloud Integration",
          },
        },
        {
          order: 5,
          slug: "kube-proxy",
          title: {
            es: "kube-proxy: cómo se implementa un Service (iptables / ipvs / nftables)",
            en: "kube-proxy: How a Service Is Implemented (iptables / ipvs / nftables)",
          },
        },
        {
          order: 6,
          slug: "endpoints-y-endpointslices",
          title: {
            es: "Endpoints y EndpointSlices",
            en: "Endpoints and EndpointSlices",
          },
        },
        {
          order: 7,
          slug: "resumen",
          title: {
            es: "Resumen",
            en: "Summary",
          },
        },
      ],
    },
    {
      order: 10,
      slug: "ingress-and-dns",
      title: {
        es: "Ingress y DNS en el cluster",
        en: "Ingress and Cluster DNS",
      },
      subparts: [
        {
          order: 1,
          slug: "introduccion",
          title: {
            es: "Introducción: cómo entra el tráfico externo",
            en: "Introduction: How External Traffic Gets In",
          },
        },
        {
          order: 2,
          slug: "ingress",
          title: {
            es: "Ingress: reglas HTTP y HTTPS",
            en: "Ingress: HTTP and HTTPS Rules",
          },
        },
        {
          order: 3,
          slug: "ingress-controller",
          title: {
            es: "IngressController: quién ejecuta esas reglas",
            en: "IngressController: Who Executes Those Rules",
          },
        },
        {
          order: 4,
          slug: "coredns",
          title: {
            es: "CoreDNS: cómo se resuelven los nombres dentro del cluster",
            en: "CoreDNS: How Names Are Resolved Inside the Cluster",
          },
        },
        {
          order: 5,
          slug: "gateway-api",
          title: {
            es: "Ingress vs Gateway API",
            en: "Ingress vs Gateway API",
          },
        },
        {
          order: 6,
          slug: "resumen",
          title: {
            es: "Resumen",
            en: "Summary",
          },
        },
      ],
    },
    {
      order: 11,
      slug: "rolling-updates",
      title: {
        es: "Rolling Updates y estrategias de Deployment",
        en: "Rolling Updates and Deployment Strategies",
      },
      subparts: [
        {
          order: 1,
          slug: "introduccion",
          title: {
            es: "Introducción: actualizar sin downtime",
            en: "Introduction: Updating Without Downtime",
          },
        },
        {
          order: 2,
          slug: "rolling-update",
          title: {
            es: "RollingUpdate: maxSurge y maxUnavailable",
            en: "RollingUpdate: maxSurge and maxUnavailable",
          },
        },
        {
          order: 3,
          slug: "recreate",
          title: {
            es: "Recreate: cuándo tiene sentido",
            en: "Recreate: When It Makes Sense",
          },
        },
        {
          order: 4,
          slug: "blue-green-y-canary",
          title: {
            es: "Blue/Green y Canary: patrones más allá del Deployment base",
            en: "Blue/Green and Canary: Patterns Beyond the Base Deployment",
          },
        },
        {
          order: 5,
          slug: "readiness-probes-en-rollout",
          title: {
            es: "Readiness probes durante un rollout",
            en: "Readiness Probes During a Rollout",
          },
        },
        {
          order: 6,
          slug: "rollback",
          title: {
            es: "Rollback: cómo volver atrás",
            en: "Rollback: How to Revert",
          },
        },
        {
          order: 7,
          slug: "resumen",
          title: {
            es: "Resumen",
            en: "Summary",
          },
        },
      ],
    },
    {
      order: 12,
      slug: "persistent-volumes",
      title: {
        es: "Persistent Volumes y PVCs explicados",
        en: "Persistent Volumes and PVCs Explained",
      },
      subparts: [
        {
          order: 1,
          slug: "introduccion",
          title: {
            es: "Introducción: estado en un mundo efímero",
            en: "Introduction: State in an Ephemeral World",
          },
        },
        {
          order: 2,
          slug: "volumes-vs-persistentvolumes",
          title: {
            es: "Volumes vs PersistentVolumes",
            en: "Volumes vs PersistentVolumes",
          },
        },
        {
          order: 3,
          slug: "pv-pvc-pod",
          title: {
            es: "El ciclo PV → PVC → Pod",
            en: "The PV → PVC → Pod Cycle",
          },
        },
        {
          order: 4,
          slug: "access-modes",
          title: {
            es: "Access modes: RWO, ROX, RWX, RWOP",
            en: "Access Modes: RWO, ROX, RWX, RWOP",
          },
        },
        {
          order: 5,
          slug: "storageclass",
          title: {
            es: "StorageClass y provisioning dinámico",
            en: "StorageClass and Dynamic Provisioning",
          },
        },
        {
          order: 6,
          slug: "reclaim-policy",
          title: {
            es: "ReclaimPolicy y lifecycle",
            en: "ReclaimPolicy and Lifecycle",
          },
        },
        {
          order: 7,
          slug: "resumen",
          title: {
            es: "Resumen",
            en: "Summary",
          },
        },
      ],
    },
    {
      order: 13,
      slug: "statefulsets-daemonsets-jobs",
      title: {
        es: "StatefulSets, DaemonSets y Jobs",
        en: "StatefulSets, DaemonSets, and Jobs",
      },
      subparts: [
        {
          order: 1,
          slug: "introduccion",
          title: {
            es: "Introducción: cuándo un Deployment no alcanza",
            en: "Introduction: When a Deployment Is Not Enough",
          },
        },
        {
          order: 2,
          slug: "statefulset",
          title: {
            es: "StatefulSet: identidad estable y almacenamiento ordenado",
            en: "StatefulSet: Stable Identity and Ordered Storage",
          },
        },
        {
          order: 3,
          slug: "daemonset",
          title: {
            es: "DaemonSet: un Pod por nodo",
            en: "DaemonSet: One Pod per Node",
          },
        },
        {
          order: 4,
          slug: "job",
          title: {
            es: "Job: tareas que terminan",
            en: "Job: Tasks That Finish",
          },
        },
        {
          order: 5,
          slug: "cronjob",
          title: {
            es: "CronJob: Jobs programados",
            en: "CronJob: Scheduled Jobs",
          },
        },
        {
          order: 6,
          slug: "cuando-elegir-cual",
          title: {
            es: "Cuándo elegir cuál",
            en: "When to Pick Which",
          },
        },
        {
          order: 7,
          slug: "resumen",
          title: {
            es: "Resumen",
            en: "Summary",
          },
        },
      ],
    },
    {
      order: 14,
      slug: "security-rbac-serviceaccounts",
      title: {
        es: "Seguridad básica: RBAC, ServiceAccounts y Pod Security",
        en: "Basic Security: RBAC, ServiceAccounts, and Pod Security",
      },
      subparts: [
        {
          order: 1,
          slug: "introduccion",
          title: {
            es: "Introducción: autenticación, autorización y admission",
            en: "Introduction: Authentication, Authorization, and Admission",
          },
        },
        {
          order: 2,
          slug: "usuarios-vs-serviceaccounts",
          title: {
            es: "Usuarios humanos vs ServiceAccounts",
            en: "Human Users vs ServiceAccounts",
          },
        },
        {
          order: 3,
          slug: "rbac",
          title: {
            es: "RBAC: Role, ClusterRole, RoleBinding, ClusterRoleBinding",
            en: "RBAC: Role, ClusterRole, RoleBinding, ClusterRoleBinding",
          },
        },
        {
          order: 4,
          slug: "tokens-y-pod-identity",
          title: {
            es: "Tokens y cómo un Pod se identifica con el API server",
            en: "Tokens and How a Pod Identifies to the API Server",
          },
        },
        {
          order: 5,
          slug: "pod-security-admission",
          title: {
            es: "Pod Security Admission: restricted, baseline, privileged",
            en: "Pod Security Admission: Restricted, Baseline, Privileged",
          },
        },
        {
          order: 6,
          slug: "menor-privilegio",
          title: {
            es: "Principio de menor privilegio en la práctica",
            en: "Least Privilege in Practice",
          },
        },
        {
          order: 7,
          slug: "resumen",
          title: {
            es: "Resumen",
            en: "Summary",
          },
        },
      ],
    },
    // ─────────────────────────────────────────────────────────────
    // BLOQUE III — Cloud Native Ecosystem and Principles
    // ─────────────────────────────────────────────────────────────
    {
      order: 15,
      slug: "autoscaling",
      title: {
        es: "Autoscaling: HPA, VPA y Cluster Autoscaler",
        en: "Autoscaling: HPA, VPA, and Cluster Autoscaler",
      },
      subparts: [
        {
          order: 1,
          slug: "introduccion",
          title: {
            es: "Introducción: escalar vertical y horizontalmente",
            en: "Introduction: Scaling Vertically and Horizontally",
          },
        },
        {
          order: 2,
          slug: "hpa",
          title: {
            es: "HPA: Horizontal Pod Autoscaler",
            en: "HPA: Horizontal Pod Autoscaler",
          },
        },
        {
          order: 3,
          slug: "vpa",
          title: {
            es: "VPA: Vertical Pod Autoscaler",
            en: "VPA: Vertical Pod Autoscaler",
          },
        },
        {
          order: 4,
          slug: "cluster-autoscaler",
          title: {
            es: "Cluster Autoscaler: escalar los nodos",
            en: "Cluster Autoscaler: Scaling the Nodes",
          },
        },
        {
          order: 5,
          slug: "metrics-server",
          title: {
            es: "Metrics Server: la base que alimenta al HPA",
            en: "Metrics Server: The Base That Feeds the HPA",
          },
        },
        {
          order: 6,
          slug: "resumen",
          title: {
            es: "Resumen",
            en: "Summary",
          },
        },
      ],
    },
    {
      order: 16,
      slug: "cloud-native-ecosystem",
      title: {
        es: "El ecosistema Cloud Native: CNCF, proyectos y principios",
        en: "The Cloud Native Ecosystem: CNCF, Projects, and Principles",
      },
      subparts: [
        {
          order: 1,
          slug: "introduccion",
          title: {
            es: "Introducción: qué es cloud native y qué no lo es",
            en: "Introduction: What Is and Isn't Cloud Native",
          },
        },
        {
          order: 2,
          slug: "cncf",
          title: {
            es: "La CNCF: misión y niveles (Sandbox, Incubating, Graduated)",
            en: "The CNCF: Mission and Levels (Sandbox, Incubating, Graduated)",
          },
        },
        {
          order: 3,
          slug: "landscape",
          title: {
            es: "El landscape: las categorías que debes conocer para la KCNA",
            en: "The Landscape: Categories You Must Know for the KCNA",
          },
        },
        {
          order: 4,
          slug: "principios-cloud-native",
          title: {
            es: "Principios cloud native: containers, microservicios, declarativo, inmutable, API-driven",
            en: "Cloud Native Principles: Containers, Microservices, Declarative, Immutable, API-Driven",
          },
        },
        {
          order: 5,
          slug: "twelve-factor",
          title: {
            es: "12-factor y su relación con cloud native",
            en: "12-Factor Apps and Their Relation to Cloud Native",
          },
        },
        {
          order: 6,
          slug: "resumen",
          title: {
            es: "Resumen",
            en: "Summary",
          },
        },
      ],
    },
    {
      order: 17,
      slug: "cloud-native-community",
      title: {
        es: "Cloud Native Community and Collaboration",
        en: "Cloud Native Community and Collaboration",
      },
      subparts: [
        {
          order: 1,
          slug: "introduccion",
          title: {
            es: "Introducción: gobernanza de un ecosistema abierto",
            en: "Introduction: Governance of an Open Ecosystem",
          },
        },
        {
          order: 2,
          slug: "sigs-y-working-groups",
          title: {
            es: "SIGs y working groups: dónde se hace el trabajo",
            en: "SIGs and Working Groups: Where the Work Happens",
          },
        },
        {
          order: 3,
          slug: "toc-y-comites",
          title: {
            es: "TOC y comités: quién decide qué",
            en: "TOC and Committees: Who Decides What",
          },
        },
        {
          order: 4,
          slug: "como-contribuir",
          title: {
            es: "Cómo contribuir: código, docs, tests, KEPs",
            en: "How to Contribute: Code, Docs, Tests, KEPs",
          },
        },
        {
          order: 5,
          slug: "eventos",
          title: {
            es: "Eventos: KubeCon, contributor summits y meetups",
            en: "Events: KubeCon, Contributor Summits, and Meetups",
          },
        },
        {
          order: 6,
          slug: "resumen",
          title: {
            es: "Resumen",
            en: "Summary",
          },
        },
      ],
    },
    // ─────────────────────────────────────────────────────────────
    // BLOQUE IV — Observabilidad
    // ─────────────────────────────────────────────────────────────
    {
      order: 18,
      slug: "observability",
      title: {
        es: "Logs, métricas y traces: los tres pilares",
        en: "Logs, Metrics, and Traces: The Three Pillars",
      },
      subparts: [
        {
          order: 1,
          slug: "introduccion",
          title: {
            es: "Introducción: qué es observabilidad y qué no",
            en: "Introduction: What Observability Is and Isn't",
          },
        },
        {
          order: 2,
          slug: "logs",
          title: {
            es: "Logs: stdout/stderr, drivers y agregación",
            en: "Logs: stdout/stderr, Drivers, and Aggregation",
          },
        },
        {
          order: 3,
          slug: "metricas",
          title: {
            es: "Métricas: modelo pull vs push",
            en: "Metrics: Pull vs Push Model",
          },
        },
        {
          order: 4,
          slug: "traces",
          title: {
            es: "Traces: OpenTelemetry como estándar",
            en: "Traces: OpenTelemetry as the Standard",
          },
        },
        {
          order: 5,
          slug: "events-y-describe",
          title: {
            es: "Events y kubectl describe: la primera capa de debug",
            en: "Events and kubectl describe: The First Debug Layer",
          },
        },
        {
          order: 6,
          slug: "resumen",
          title: {
            es: "Resumen",
            en: "Summary",
          },
        },
      ],
    },
    {
      order: 19,
      slug: "prometheus",
      title: {
        es: "Prometheus y el modelo pull",
        en: "Prometheus and the Pull Model",
      },
      subparts: [
        {
          order: 1,
          slug: "introduccion",
          title: {
            es: "Introducción: el modelo pull y el target",
            en: "Introduction: The Pull Model and the Target",
          },
        },
        {
          order: 2,
          slug: "servicemonitor",
          title: {
            es: "ServiceMonitor y kube-prometheus-stack",
            en: "ServiceMonitor and kube-prometheus-stack",
          },
        },
        {
          order: 3,
          slug: "promql",
          title: {
            es: "PromQL en 10 minutos",
            en: "PromQL in 10 Minutes",
          },
        },
        {
          order: 4,
          slug: "alerting",
          title: {
            es: "Alerting: AlertManager y receivers",
            en: "Alerting: AlertManager and Receivers",
          },
        },
        {
          order: 5,
          slug: "grafana",
          title: {
            es: "Grafana: visualización estándar",
            en: "Grafana: The Standard Visualization",
          },
        },
        {
          order: 6,
          slug: "resumen",
          title: {
            es: "Resumen",
            en: "Summary",
          },
        },
      ],
    },
    // ─────────────────────────────────────────────────────────────
    // BLOQUE V — Cloud Native Application Delivery
    // ─────────────────────────────────────────────────────────────
    {
      order: 20,
      slug: "gitops-and-cicd",
      title: {
        es: "GitOps y CI/CD en Kubernetes",
        en: "GitOps and CI/CD on Kubernetes",
      },
      subparts: [
        {
          order: 1,
          slug: "introduccion",
          title: {
            es: "Introducción: la promesa de GitOps",
            en: "Introduction: The Promise of GitOps",
          },
        },
        {
          order: 2,
          slug: "ci-vs-cd",
          title: {
            es: "CI vs CD: dónde empieza Kubernetes",
            en: "CI vs CD: Where Kubernetes Begins",
          },
        },
        {
          order: 3,
          slug: "argocd-y-flux",
          title: {
            es: "Argo CD y Flux: los dos ejes",
            en: "Argo CD and Flux: The Two Axes",
          },
        },
        {
          order: 4,
          slug: "helm-y-kustomize",
          title: {
            es: "Helm y Kustomize: cómo se empaqueta la app",
            en: "Helm and Kustomize: How the App Is Packaged",
          },
        },
        {
          order: 5,
          slug: "rollouts-progresivos",
          title: {
            es: "Rollouts progresivos y seguridad de despliegue",
            en: "Progressive Rollouts and Deployment Safety",
          },
        },
        {
          order: 6,
          slug: "resumen",
          title: {
            es: "Resumen",
            en: "Summary",
          },
        },
      ],
    },
    // ─────────────────────────────────────────────────────────────
    // CIERRE
    // ─────────────────────────────────────────────────────────────
    {
      order: 21,
      slug: "kcna-exam-prep",
      title: {
        es: "Cómo prepararte para el examen KCNA",
        en: "How to Prepare for the KCNA Exam",
      },
      subparts: [
        {
          order: 1,
          slug: "introduccion",
          title: {
            es: "Introducción: qué es la KCNA y a quién va dirigida",
            en: "Introduction: What the KCNA Is and Who It's For",
          },
        },
        {
          order: 2,
          slug: "formato-y-tiempo",
          title: {
            es: "Formato, tiempo y peso por dominio",
            en: "Format, Time, and Weight per Domain",
          },
        },
        {
          order: 3,
          slug: "recursos-oficiales",
          title: {
            es: "Recursos oficiales y repaso por dominio",
            en: "Official Resources and Domain-by-Domain Review",
          },
        },
        {
          order: 4,
          slug: "simulacros",
          title: {
            es: "Simulacros y estrategia el día del examen",
            en: "Practice Exams and Test-Day Strategy",
          },
        },
        {
          order: 5,
          slug: "despues-de-kcna",
          title: {
            es: "Después de la KCNA: CKAD, CKA y el camino largo",
            en: "After the KCNA: CKAD, CKA, and the Long Road",
          },
        },
      ],
    },
  ],
};

export default kubernetesForBeginners;
