export default {
  es: `
      <h2>¿Por qué el almacenamiento efímero no es suficiente?</h2>
      <p>Por defecto, el sistema de archivos de un contenedor es efímero: muere con el Pod. Esto es perfecto para aplicaciones sin estado, pero inaceptable para bases de datos, colas de mensajes o cualquier carga de trabajo que deba sobrevivir a reinicios.</p>

      <h2>PersistentVolume (PV)</h2>
      <p>Un <strong>PersistentVolume</strong> es un recurso de almacenamiento aprovisionado por un administrador (o dinámicamente por un StorageClass). Existe de forma independiente al ciclo de vida de cualquier Pod.</p>
      <pre><code>apiVersion: v1
kind: PersistentVolume
metadata:
  name: pv-demo
spec:
  capacity:
    storage: 5Gi
  accessModes:
    - ReadWriteOnce
  hostPath:
    path: /mnt/data</code></pre>

      <h2>PersistentVolumeClaim (PVC)</h2>
      <p>Un <strong>PersistentVolumeClaim</strong> es la solicitud de almacenamiento de un usuario. Kubernetes busca un PV que satisfaga los requisitos (tamaño, modos de acceso) y los vincula.</p>
      <pre><code>apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: mi-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 2Gi</code></pre>

      <h2>Usar el PVC en un Pod</h2>
      <pre><code>volumes:
  - name: datos
    persistentVolumeClaim:
      claimName: mi-pvc
containers:
  - name: app
    volumeMounts:
      - mountPath: /datos
        name: datos</code></pre>

      <h2>StorageClasses y aprovisionamiento dinámico</h2>
      <p>En producción es raro crear PVs a mano. Los proveedores de nube ofrecen <strong>StorageClasses</strong> que aprovisionan discos automáticamente cuando se crea un PVC. Solo especifica <code>storageClassName</code> en tu claim y Kubernetes hace el resto.</p>

      <h2>Conclusión</h2>
      <p>PV/PVC dan a tus cargas de trabajo con estado el almacenamiento persistente que necesitan, con una separación clara de responsabilidades: el administrador provee capacidad, el desarrollador la reclama.</p>
    `,
  en: `
      <h2>Why ephemeral storage isn't enough</h2>
      <p>By default, a container's filesystem is ephemeral — it dies with the Pod. This is perfect for stateless applications, but unacceptable for databases, message queues, or any workload that must survive restarts.</p>

      <h2>PersistentVolume (PV)</h2>
      <p>A <strong>PersistentVolume</strong> is a storage resource provisioned by an administrator (or dynamically by a StorageClass). It exists independently of any Pod's lifecycle.</p>
      <pre><code>apiVersion: v1
kind: PersistentVolume
metadata:
  name: pv-demo
spec:
  capacity:
    storage: 5Gi
  accessModes:
    - ReadWriteOnce
  hostPath:
    path: /mnt/data</code></pre>

      <h2>PersistentVolumeClaim (PVC)</h2>
      <p>A <strong>PersistentVolumeClaim</strong> is a user's request for storage. Kubernetes finds a PV that satisfies the requirements (size, access modes) and binds them together.</p>
      <pre><code>apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 2Gi</code></pre>

      <h2>Using a PVC in a Pod</h2>
      <pre><code>volumes:
  - name: data
    persistentVolumeClaim:
      claimName: my-pvc
containers:
  - name: app
    volumeMounts:
      - mountPath: /data
        name: data</code></pre>

      <h2>StorageClasses and dynamic provisioning</h2>
      <p>In production, manually creating PVs is rare. Cloud providers offer <strong>StorageClasses</strong> that automatically provision disks when a PVC is created. Just specify <code>storageClassName</code> in your claim and Kubernetes handles the rest.</p>

      <h2>Conclusion</h2>
      <p>PV/PVC give stateful workloads the persistent storage they need, with a clear separation of responsibilities: the administrator provides capacity, the developer claims it.</p>
    `,
}
