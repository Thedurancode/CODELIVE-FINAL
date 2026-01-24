'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useSubmitIssue, useClientProject } from '@/hooks/use-client-portal';

export default function NewIssuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [form, setForm] = useState({
    title: '',
    description: '',
  });

  const { data: project } = useClientProject(id);
  const submitIssue = useSubmitIssue();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.title.trim()) {
      toast.error('Title is required');
      return;
    }

    try {
      const issue = await submitIssue.mutateAsync({
        projectId: id,
        title: form.title,
        description: form.description,
      });

      toast.success('Issue created successfully!');
      router.push(`/client/projects/${id}/issues`);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(`/client/projects/${id}/issues`)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Issue</h1>
          <p className="text-muted-foreground">
            Submit an issue for {project?.title || 'this project'}
          </p>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>Issue Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Brief description of the issue"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="Provide more details about the issue..."
                rows={8}
              />
              <p className="text-xs text-muted-foreground">
                You can use Markdown for formatting.
              </p>
            </div>
            <div className="flex items-center justify-end gap-4 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(`/client/projects/${id}/issues`)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitIssue.isPending}>
                {submitIssue.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Issue'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Tips */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-medium mb-2">Tips for a good issue</h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Use a clear, descriptive title</li>
            <li>Describe what you expected vs. what happened</li>
            <li>Include steps to reproduce if it&apos;s a bug</li>
            <li>Add screenshots if they help explain the issue</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
