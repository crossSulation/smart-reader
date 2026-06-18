export interface KnowledgePointItem {
  id: number;
  user_id: number;
  label: string;
  aliases: string[];
  description: string | null;
  source_chunk_ids: number[];
  entity_type: string;
  link_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface KnowledgePointDetail extends KnowledgePointItem {
  linked_points: KnowledgePointItem[];
  sample_chunks: SampleChunk[];
}

export interface SampleChunk {
  chunk_id: number;
  book_id: number;
  book_title: string;
  text: string;
  section_path: string | null;
  page_start: number | null;
}

export interface GraphNode {
  id: number;
  label: string;
  entity_type: string;
  link_count: number;
}

export interface GraphEdge {
  id: number;
  source: number;
  target: number;
  relation_type: string;
  weight: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface KnowledgeStats {
  total_nodes: number;
  total_edges: number;
  density: number;
  entity_type_distribution: Record<string, number>;
}

export interface KnowledgeLink {
  id: number;
  source_kp_id: number;
  target_kp_id: number;
  relation_type: string;
  weight: number;
  evidence_chunk_ids: number[];
  created_at: string | null;
}
