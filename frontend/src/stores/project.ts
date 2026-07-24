import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api';
import type { Project } from '@/types';

export const useProjectStore = defineStore('project', () => {
  const projects = ref<Project[]>([]);
  const loading = ref(false);
  const current = ref<Project | null>(null);

  async function load(): Promise<void> {
    loading.value = true;
    try {
      const res = await api.listProjects();
      projects.value = res.projects;
    } finally {
      loading.value = false;
    }
  }

  async function select(id: string): Promise<Project> {
    const res = await api.getProject(id);
    current.value = res.project;
    return res.project;
  }

  async function create(body: { name?: string; path?: string; dirName?: string }): Promise<Project> {
    const res = await api.createProject(body);
    projects.value.unshift(res.project);
    return res.project;
  }

  async function remove(id: string): Promise<void> {
    await api.deleteProject(id);
    projects.value = projects.value.filter((p) => p.id !== id);
    if (current.value?.id === id) current.value = null;
  }

  return { projects, loading, current, load, select, create, remove };
});
