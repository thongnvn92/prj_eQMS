// Document Control (documents + workflow transition)
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { DocAction, DocumentItem } from '../../mock/types';
import { api } from '../../services/api';
import { fetchDashboard } from './dashboardSlice';

interface DocumentsState {
  items: DocumentItem[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error?: string;
  transitioning: boolean;
  creating: boolean;
  updating: boolean;
  uploading: boolean;
  deleting: boolean;
}

const initialState: DocumentsState = {
  items: [],
  status: 'idle',
  transitioning: false,
  creating: false,
  updating: false,
  uploading: false,
  deleting: false,
};

export const fetchDocuments = createAsyncThunk('documents/fetch', () => api.documents());

export const createDocument = createAsyncThunk(
  'documents/create',
  async (input: {
    code: string; name: string; docType: DocumentItem['docType'];
    departmentId?: number | null; ownerId?: number | null;
    relatedTaskId?: number | null; description?: string; changeSummary?: string;
    autoVersion?: boolean;
  }, { dispatch }) => {
    const doc = await api.createDocument(input);
    await dispatch(fetchDocuments());
    return doc;
  },
);

/** Import hàng loạt tài liệu (bulk endpoint) – 1 request, trả { imported, errors }. */
export const importDocuments = createAsyncThunk(
  'documents/importDocuments',
  async (rows: Parameters<typeof api.importDocuments>[0], { dispatch }) => {
    const result = await api.importDocuments(rows);
    await dispatch(fetchDocuments());
    return result;
  },
);

export const updateDocument = createAsyncThunk(
  'documents/update',
  async (input: {
    id: number; patch: {
      code?: string; name?: string; docType?: DocumentItem['docType'];
      departmentId?: number | null; ownerId?: number | null;
      relatedTaskId?: number | null; description?: string; changeSummary?: string;
      autoVersion?: boolean; version?: string;
    };
  }, { dispatch }) => {
    const doc = await api.updateDocument(input.id, input.patch);
    await dispatch(fetchDocuments());
    return doc;
  },
);

export const deleteDocument = createAsyncThunk(
  'documents/delete',
  async (id: number, { dispatch }) => {
    const res = await api.deleteDocument(id);
    await Promise.all([dispatch(fetchDocuments()), dispatch(fetchDashboard())]);
    return res;
  },
);

export const transitionDocument = createAsyncThunk(
  'documents/transition',
  async (input: { id: number; action: DocAction; comment?: string }, { dispatch }) => {
    const doc = await api.transitionDocument(input.id, input.action, input.comment);
    await Promise.all([dispatch(fetchDocuments()), dispatch(fetchDashboard())]);
    return doc;
  },
);

export const uploadDocumentFile = createAsyncThunk(
  'documents/uploadFile',
  async (input: { documentId: number; files: File[]; changeNote?: string }, { dispatch }) => {
    const df = await api.uploadDocumentFile(input.documentId, input.files, input.changeNote);
    await dispatch(fetchDocuments());
    return df;
  },
);

export const newDocumentVersion = createAsyncThunk(
  'documents/newVersion',
  async (input: { id: number; version?: string; changeSummary?: string }, { dispatch }) => {
    const doc = await api.newDocumentVersion(input.id, { version: input.version, changeSummary: input.changeSummary });
    await Promise.all([dispatch(fetchDocuments()), dispatch(fetchDashboard())]);
    return doc;
  },
);

export const toggleAutoVersion = createAsyncThunk(
  'documents/toggleAutoVersion',
  async (input: { id: number; autoVersion: boolean }, { dispatch }) => {
    const doc = await api.toggleAutoVersion(input.id, input.autoVersion);
    await dispatch(fetchDocuments());
    return doc;
  },
);

const documentsSlice = createSlice({
  name: 'documents',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchDocuments.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchDocuments.fulfilled, (state, action) => {
        state.items = action.payload;
        state.status = 'succeeded';
      })
      .addCase(fetchDocuments.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message;
      })
      .addCase(transitionDocument.pending, (state) => {
        state.transitioning = true;
      })
      .addCase(transitionDocument.fulfilled, (state) => {
        state.transitioning = false;
      })
      .addCase(transitionDocument.rejected, (state) => {
        state.transitioning = false;
      })
      .addCase(createDocument.pending, (state) => {
        state.creating = true;
      })
      .addCase(createDocument.fulfilled, (state) => {
        state.creating = false;
      })
      .addCase(createDocument.rejected, (state) => {
        state.creating = false;
      })
      .addCase(updateDocument.pending, (state) => {
        state.updating = true;
      })
      .addCase(updateDocument.fulfilled, (state) => {
        state.updating = false;
      })
      .addCase(updateDocument.rejected, (state) => {
        state.updating = false;
      })
      .addCase(uploadDocumentFile.pending, (state) => {
        state.uploading = true;
      })
      .addCase(uploadDocumentFile.fulfilled, (state) => {
        state.uploading = false;
      })
      .addCase(uploadDocumentFile.rejected, (state) => {
        state.uploading = false;
      })
      .addCase(newDocumentVersion.pending, (state) => {
        state.updating = true;
      })
      .addCase(newDocumentVersion.fulfilled, (state) => {
        state.updating = false;
      })
      .addCase(newDocumentVersion.rejected, (state) => {
        state.updating = false;
      })
      .addCase(toggleAutoVersion.pending, (state) => {
        state.updating = true;
      })
      .addCase(toggleAutoVersion.fulfilled, (state) => {
        state.updating = false;
      })
      .addCase(toggleAutoVersion.rejected, (state) => {
        state.updating = false;
      })
      .addCase(deleteDocument.pending, (state) => {
        state.deleting = true;
      })
      .addCase(deleteDocument.fulfilled, (state) => {
        state.deleting = false;
      })
      .addCase(deleteDocument.rejected, (state) => {
        state.deleting = false;
      });
  },
});

export default documentsSlice.reducer;
