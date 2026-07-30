/**
 * KnowledgeGraphPage - 知识图谱页面（已接入后端 API + 力导向画布）
 * 规范参考：UI_spec.md §6；数据来源：后端 /api/v1/graph/*
 */
import { useEffect, useState } from 'react';
import { useGraphStore } from '../../stores/graphStore';
import { fetchGraphNodes, fetchGraphEdges, syncGraphNodes, triggerGraphBuild } from '../../services/graphApi';
import { GraphCanvas } from './GraphCanvas';
import styles from './KnowledgeGraphPage.module.css';

export function KnowledgeGraphPage() {
  const { nodes, edges, loading, error, selectedNodeId, setNodes, setEdges, setLoading, setError, setSelectedNode } = useGraphStore();
  const [buildStatus, setBuildStatus] = useState<string | null>(null);

  useEffect(() => {
    loadGraph();
  }, []);

  async function loadGraph() {
    setLoading(true);
    setError(null);
    try {
      const [nodesData, edgesData] = await Promise.all([
        fetchGraphNodes(),
        fetchGraphEdges(),
      ]);
      setNodes(nodesData);
      setEdges(edgesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载图谱失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    setLoading(true);
    setError(null);
    setBuildStatus('同步节点中...');
    try {
      const count = await syncGraphNodes();
      setBuildStatus(`✓ 同步了 ${count} 个节点`);
      await loadGraph();
      setTimeout(() => setBuildStatus(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : '同步失败';
      setError(message);
      setBuildStatus(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleBuild(useAI: boolean = false) {
    setLoading(true);
    setError(null);
    setBuildStatus(useAI ? 'AI 建边中...' : '快速建边中...');
    try {
      const result = await triggerGraphBuild(useAI);
      setBuildStatus(`✓ 创建了 ${result.created_count} 条边`);
      await loadGraph();
      setTimeout(() => setBuildStatus(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : '生成边失败';
      setError(message);
      setBuildStatus(null);
    } finally {
      setLoading(false);
    }
  }

  function handleNodeDrag(node: any, x: number, y: number) {
    // TODO: 持久化节点坐标到后端
    console.log(`Node ${node.id} dragged to (${x}, ${y})`);
  }

  if (loading && nodes.length === 0) {
    return (
      <main className={styles.container}>
        <div className={styles.emptyState}>
          <p>加载中...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className={styles.container}>
        <div className={styles.emptyState}>
          <p style={{ color: 'var(--danger)' }}>{error}</p>
          <button onClick={loadGraph}>重试</button>
        </div>
      </main>
    );
  }

  if (nodes.length === 0) {
    return (
      <main className={styles.container}>
        <div className={styles.emptyState}>
          <h2>知识图谱</h2>
          <p>当前没有图谱节点</p>
          <p className={styles.hint}>从文档库同步节点后，可以生成知识关联</p>
          <div className={styles.actions}>
            <button onClick={handleSync} disabled={loading}>
              同步节点
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.container}>
      <div className={styles.toolbar}>
        <button onClick={handleSync} disabled={loading}>
          同步节点 ({nodes.length})
        </button>
        <button onClick={() => handleBuild(false)} disabled={loading || nodes.length < 2}>
          快速建边 ({edges.length})
        </button>
        <button onClick={() => handleBuild(true)} disabled={loading || nodes.length < 2}>
          AI 建边
        </button>
        <button onClick={loadGraph} disabled={loading}>
          刷新
        </button>
        {buildStatus && (
          <span className={styles.status}>{buildStatus}</span>
        )}
      </div>

      <div className={styles.graph}>
        <GraphCanvas
          nodes={nodes}
          edges={edges}
          selectedNodeId={selectedNodeId}
          onNodeClick={(node) => setSelectedNode(node.id)}
          onNodeDrag={handleNodeDrag}
        />
      </div>
    </main>
  );
}