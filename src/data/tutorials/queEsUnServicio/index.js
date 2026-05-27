const queEsUnServicio = {
  id: 3,
  slug: "que-es-un-servicio",
  loadPart: (order) => import(`./part${order}.js`),
  title: {
    es: "¿Qué es un Service?",
    en: "What is a Service?",
  },
  subtitle: {
    es: "Virtual IPs, kube-proxy y el camino de un paquete",
    en: "Virtual IPs, kube-proxy, and the Path of a Packet",
  },
  description: {
    es: "Un Service no es un proceso ni una interfaz de red. Es una IP virtual que el kernel intercepta mediante reglas iptables o IPVS. Analizamos kube-proxy, EndpointSlices, los modos de proxy y trazamos el camino completo de un paquete desde un Pod hasta su destino.",
    en: "A Service is not a process or a network interface. It is a virtual IP the kernel intercepts through iptables or IPVS rules. We analyze kube-proxy, EndpointSlices, proxy modes, and trace the complete path of a packet from a Pod to its destination.",
  },
  tags: ["kubernetes", "services", "kube-proxy", "iptables", "networking"],
  parts: [
    {
      order: 1,
      slug: "introduccion",
      title: {
        es: "Introducción: el problema que un Service resuelve",
        en: "Introduction: The Problem a Service Solves",
      },
    },
    {
      order: 2,
      slug: "la-ip-virtual-que-no-existe",
      title: {
        es: "La IP virtual que no existe",
        en: "The Virtual IP That Does Not Exist",
      },
    },
    {
      order: 3,
      slug: "kube-proxy-y-los-modos-de-proxy",
      title: {
        es: "kube-proxy y los modos de proxy",
        en: "kube-proxy and Proxy Modes",
      },
    },
    {
      order: 4,
      slug: "reglas-iptables-en-profundidad",
      title: {
        es: "Las reglas iptables en profundidad",
        en: "iptables Rules in Depth",
      },
    },
    {
      order: 5,
      slug: "endpointslices",
      title: {
        es: "EndpointSlices",
        en: "EndpointSlices",
      },
    },
    {
      order: 6,
      slug: "tipos-de-service",
      title: {
        es: "Tipos de Service",
        en: "Service Types",
      },
    },
    {
      order: 7,
      slug: "dns-y-coredns",
      title: {
        es: "DNS y CoreDNS",
        en: "DNS and CoreDNS",
      },
    },
    {
      order: 8,
      slug: "el-flujo-completo-de-un-paquete",
      title: {
        es: "El flujo completo de un paquete",
        en: "The Complete Path of a Packet",
      },
    },
    {
      order: 9,
      slug: "como-crear-un-service-desde-0",
      title: {
        es: "Cómo crear un Service desde 0",
        en: "How to Create a Service from Scratch",
      },
    },
    {
      order: 10,
      slug: "resumen",
      title: {
        es: "Resumen",
        en: "Summary",
      },
    },
  ],
};

export default queEsUnServicio;
