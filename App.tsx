import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { ExamConfig, ExamDifficulty, getLatexTemplate } from './types';

const App: React.FC = () => {
  const [config, setConfig] = useState<ExamConfig>({
    topic: '',
    grade: '6',
    difficulty: ExamDifficulty.MEDIUM,
    numMultipleChoice: 10,
    numEssay: 2,
    useTikz: true,
    varyData: false,
    language: 'vi', // Default to Vietnamese
  });

  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [generatedCode, setGeneratedCode] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Preview State
  const [previewFile, setPreviewFile] = useState<{ url: string; type: 'image' | 'pdf'; name: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup preview URL when modal closes or component unmounts
  useEffect(() => {
    return () => {
      if (previewFile) {
        URL.revokeObjectURL(previewFile.url);
      }
    };
  }, [previewFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files).filter(
        file => file.type === 'application/pdf' || file.type.startsWith('image/')
      );
      setFiles(prev => [...prev, ...droppedFiles]);
    }
  }, []);

  const removeFile = (indexToRemove: number) => {
    setFiles(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const handlePreview = (file: File) => {
    const url = URL.createObjectURL(file);
    const type = file.type === 'application/pdf' ? 'pdf' : 'image';
    setPreviewFile({ url, type, name: file.name });
  };

  const closePreview = () => {
    if (previewFile) {
      URL.revokeObjectURL(previewFile.url);
      setPreviewFile(null);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleGenerate = async () => {
    if (!config.topic && files.length === 0) {
      setError('Vui lòng nhập chủ đề kiểm tra hoặc tải lên tài liệu.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setGeneratedCode('');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const currentTemplate = getLatexTemplate(config.language);
      
      let promptText = `
Đóng vai trò là một trợ giảng Toán học và chuyên gia LaTeX. Hãy tạo cho tôi một đề kiểm tra Toán hoàn chỉnh, sử dụng chính xác cấu trúc LaTeX tôi cung cấp bên dưới.

YÊU CẦU ĐẶC BIỆT:
${files.length > 0 ? `- ĐÃ CÓ ${files.length} TÀI LIỆU ĐÍNH KÈM.` : ''}
${config.varyData 
  ? '- HÃY THAY ĐỔI SỐ LIỆU trong các bài toán so với tài liệu gốc để tạo đề mới, nhưng PHẢI GIỮ NGUYÊN dạng toán và mức độ kiến thức.' 
  : '- GIỮ NGUYÊN SỐ LIỆU và dạng toán như trong tài liệu (nếu có), hoặc tạo bài toán chuẩn mực.'}

YÊU CẦU VỀ NGÔN NGỮ (QUAN TRỌNG):
- NGÔN NGỮ ĐẦU RA CỦA ĐỀ THI: **${config.language === 'vi' ? 'TIẾNG VIỆT' : 'TIẾNG ANH (ENGLISH)'}**.
${config.language === 'en' ? '- Hãy dịch toàn bộ nội dung câu hỏi, lời giải và thuật ngữ toán học sang Tiếng Anh chuẩn Cambridge.' : ''}

YÊU CẦU VỀ NỘI DUNG:
1. Chủ đề: ${config.topic || 'Dựa theo tài liệu đính kèm'}
2. Đối tượng: Lớp ${config.grade}
3. Độ khó: ${config.difficulty}
4. Cấu trúc đề:
   - Phần 1: Trắc nghiệm (${config.numMultipleChoice} câu).
   - Phần 2: Tự luận (${config.numEssay} câu). Yêu cầu trình bày rõ ràng.

YÊU CẦU QUAN TRỌNG VỀ TOÁN HỌC & LATEX:
1. **CỠ CHỮ:** Đề thi phải được thiết lập cỡ chữ 13pt (đã có trong template với gói scrextend).
2. **PHÂN SỐ:** BẮT BUỘC sử dụng lệnh \\dfrac{...}{...} cho tất cả các phân số để hiển thị to, rõ ràng (KHÔNG dùng \\frac).
3. **DẠNG ĐIỀN SỐ CÒN THIẾU (QUAN TRỌNG):** 
   - Tuyệt đối cẩn thận khi tạo mã LaTeX cho các bài toán điền ô trống.
   - **Ô TRẢ LỜI:** Sử dụng \\framebox[1.5em]{\\vphantom{M}} hoặc \\fbox{\\phantom{00}} để tạo ô trống **RỖNG** (TUYỆT ĐỐI KHÔNG ĐIỀN DẤU CHẤM HỎI "?" VÀO TRONG). Mục đích là để học sinh điền kết quả vào.
   - Với phép tính dọc: Sử dụng môi trường \\begin{array} hoặc \\begin{tabular} với căn lề chuẩn xác.
4. **HÌNH VẼ (QUAN TRỌNG):**
   ${config.useTikz 
     ? '- Tự động sinh mã TikZ đầy đủ. **YÊU CẦU ĐẶC BIỆT:** Hình vẽ phải thoáng, KHÔNG ĐƯỢC đè lên chữ hoặc các chi tiết khác. Các nhãn (label), số đo góc/cạnh phải đặt ở vị trí dễ nhìn, không bị chồng chéo (dùng thuộc tính như `pos=0.5, above, below` hợp lý).' 
     : '- KHÔNG vẽ hình bằng TikZ. Hãy chèn lệnh \\includegraphics[width=5cm]{image_placeholder.png} và để lại chú thích "% Thay thế bằng hình ảnh bài toán..."'}

YÊU CẦU VỀ CẤU TRÚC CODE (BẮT BUỘC):
1. Giữ nguyên toàn bộ phần Preamble trong Template.
2. Sử dụng đúng môi trường custom đã định nghĩa: \\begin{questionbox}{Câu...} ... \\end{questionbox}.
3. Không được thay đổi các gói lệnh (packages).
4. CHỈ TRẢ VỀ MÃ LATEX ĐẦY ĐỦ, KHÔNG GIẢI THÍCH. BẮT ĐẦU BẰNG \\documentclass VÀ KẾT THÚC BẰNG \\end{document}.

TEMPLATE (${config.language === 'vi' ? 'Tiếng Việt' : 'English'}):
${currentTemplate}
      `;

      const parts: any[] = [{ text: promptText }];

      for (const file of files) {
        const base64Data = await fileToBase64(file);
        parts.push({
          inlineData: {
            mimeType: file.type,
            data: base64Data
          }
        });
      }

const response = await ai.models.generateContent({
        model: 'gemini-3.0-flash', // <-- Sửa thành dòng này
        contents: {
          parts: parts
        },
        // Xóa hẳn phần thinkingConfig, chỉ để lại config cơ bản nếu cần (hoặc bỏ trống)
      });

      let text = response.text || '';
      
      if (text.startsWith('```latex')) {
        text = text.replace(/^```latex/, '').replace(/```$/, '');
      } else if (text.startsWith('```')) {
        text = text.replace(/^```/, '').replace(/```$/, '');
      }

      setGeneratedCode(text.trim());
    } catch (err: any) {
      setError(err.message || 'Đã có lỗi xảy ra khi tạo đề.');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedCode);
    alert('Đã sao chép mã LaTeX vào bộ nhớ tạm!');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-8 px-4 font-sans">
      <header className="mb-8 text-center max-w-2xl">
        <h1 className="text-4xl font-bold text-slate-800 mb-2 font-sans tracking-tight">LaTeX Exam Generator</h1>
        <p className="text-slate-600 text-lg">Trợ lý AI tạo đề thi Toán chuẩn Overleaf cho giáo viên</p>
      </header>

      <main className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Configuration Form (Takes 5/12 columns on large screens) */}
        <div className="lg:col-span-5 bg-white p-6 lg:p-8 rounded-2xl shadow-xl border border-slate-200 h-fit">
          <div className="flex items-center justify-between mb-6 border-b border-indigo-100 pb-4">
            <div className="flex items-center text-indigo-700">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
               </svg>
               <h2 className="text-2xl font-bold">Cấu hình</h2>
            </div>
            {/* Language Switcher */}
            <div className="flex bg-slate-100 p-1 rounded-lg">
               <button
                  onClick={() => setConfig({...config, language: 'vi'})}
                  className={`px-3 py-1.5 rounded-md text-sm font-bold transition-all flex items-center gap-1.5 ${config.language === 'vi' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
               >
                  <span>🇻🇳</span> VI
               </button>
               <button
                  onClick={() => setConfig({...config, language: 'en'})}
                  className={`px-3 py-1.5 rounded-md text-sm font-bold transition-all flex items-center gap-1.5 ${config.language === 'en' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
               >
                  <span>🇬🇧</span> EN
               </button>
            </div>
          </div>

          <div className="space-y-6">
            
            {/* File Upload Section */}
            <div 
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`p-6 rounded-xl border-2 border-dashed transition-all duration-200 ease-in-out ${
                isDragging 
                  ? 'border-indigo-500 bg-indigo-50 scale-[1.02]' 
                  : 'border-slate-300 bg-slate-50 hover:border-indigo-400'
              }`}
            >
              <div className="flex flex-col items-center justify-center text-center">
                <div className="mb-3 p-3 bg-white rounded-full shadow-sm border border-slate-100">
                  <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <label className="block text-sm font-bold text-slate-700 mb-1 cursor-pointer">
                  Kéo thả tài liệu vào đây hoặc <span className="text-indigo-600 hover:underline">tải lên</span>
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="application/pdf,image/*"
                    multiple
                    className="hidden" 
                  />
                </label>
                <p className="text-xs text-slate-500">Hỗ trợ PDF, PNG, JPG (Để AI tham khảo dạng bài)</p>
              </div>

              {/* File List with Preview */}
              {files.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Đã chọn {files.length} tệp:</div>
                  <div className="max-h-32 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {files.map((f, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm text-sm group hover:border-indigo-300 transition-colors">
                        <div className="flex items-center truncate flex-1 min-w-0 mr-2">
                          <svg className="w-4 h-4 text-red-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd"/></svg>
                          <span className="truncate text-slate-700 font-medium cursor-default" title={f.name}>{f.name}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => handlePreview(f)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition"
                            title="Xem trước"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                          <button 
                            onClick={() => removeFile(idx)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition"
                            title="Xóa"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Input Fields - Styled for High Visibility */}
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-2">Chủ đề (Topic)</label>
                <input 
                  type="text"
                  className="w-full px-4 py-3.5 rounded-xl border border-slate-300 bg-white text-slate-900 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition placeholder-slate-400 font-medium"
                  placeholder={config.language === 'vi' ? "Ví dụ: Phép chia hết cho 3, 6, 9..." : "e.g., Divisibility by 3, 6, 9..."}
                  value={config.topic}
                  onChange={(e) => setConfig({ ...config, topic: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-2">{config.language === 'vi' ? 'Lớp' : 'Grade'}</label>
                  <select 
                    className="w-full px-4 py-3.5 rounded-xl border border-slate-300 bg-white text-slate-900 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-medium appearance-none cursor-pointer"
                    value={config.grade}
                    onChange={(e) => setConfig({ ...config, grade: e.target.value })}
                    style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em', paddingRight: '2.5rem' }}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(g => (
                      <option key={g} value={g}>{config.language === 'vi' ? `Lớp ${g}` : `Grade ${g}`}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-2">{config.language === 'vi' ? 'Độ khó' : 'Difficulty'}</label>
                  <select 
                     className="w-full px-4 py-3.5 rounded-xl border border-slate-300 bg-white text-slate-900 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-medium appearance-none cursor-pointer"
                    value={config.difficulty}
                    onChange={(e) => setConfig({ ...config, difficulty: e.target.value as ExamDifficulty })}
                    style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em', paddingRight: '2.5rem' }}
                  >
                    {Object.values(ExamDifficulty).map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-2">{config.language === 'vi' ? 'Trắc nghiệm' : 'Multiple Choice'}</label>
                  <div className="relative">
                     <input 
                      type="number"
                      min="0"
                      max="50"
                      className="w-full px-4 py-3.5 rounded-xl border border-slate-300 bg-white text-slate-900 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-medium"
                      value={config.numMultipleChoice}
                      onChange={(e) => setConfig({ ...config, numMultipleChoice: parseInt(e.target.value) || 0 })}
                    />
                    <span className="absolute right-4 top-3.5 text-slate-400 text-sm font-medium pointer-events-none">{config.language === 'vi' ? 'câu' : 'q'}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-2">{config.language === 'vi' ? 'Tự luận' : 'Essay'}</label>
                  <div className="relative">
                    <input 
                      type="number"
                      min="0"
                      max="10"
                      className="w-full px-4 py-3.5 rounded-xl border border-slate-300 bg-white text-slate-900 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-medium"
                      value={config.numEssay}
                      onChange={(e) => setConfig({ ...config, numEssay: parseInt(e.target.value) || 0 })}
                    />
                    <span className="absolute right-4 top-3.5 text-slate-400 text-sm font-medium pointer-events-none">{config.language === 'vi' ? 'câu' : 'q'}</span>
                  </div>
                </div>
              </div>

              {/* Advanced Options Toggles */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between">
                   <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-800">{config.language === 'vi' ? 'Hình ảnh / Đồ thị' : 'Images / Graphs'}</span>
                      <span className="text-xs text-slate-500">{config.language === 'vi' ? 'Tự động vẽ bằng mã TikZ?' : 'Auto-generate TikZ code?'}</span>
                   </div>
                   <button 
                     onClick={() => setConfig({...config, useTikz: !config.useTikz})}
                     className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none ${config.useTikz ? 'bg-indigo-600' : 'bg-slate-300'}`}
                   >
                     <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${config.useTikz ? 'translate-x-6' : 'translate-x-1'}`} />
                   </button>
                </div>
                
                <div className="h-px bg-slate-200"></div>

                <div className="flex items-center justify-between">
                   <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-800">{config.language === 'vi' ? 'Số liệu bài tập' : 'Data Variation'}</span>
                      <span className="text-xs text-slate-500">{config.language === 'vi' ? 'Đổi số khác với tài liệu gốc?' : 'Vary numbers from source?'}</span>
                   </div>
                   <button 
                     onClick={() => setConfig({...config, varyData: !config.varyData})}
                     className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none ${config.varyData ? 'bg-indigo-600' : 'bg-slate-300'}`}
                   >
                     <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${config.varyData ? 'translate-x-6' : 'translate-x-1'}`} />
                   </button>
                </div>
              </div>

            </div>

            <div className="pt-4">
              <button 
                onClick={handleGenerate}
                disabled={isLoading}
                className={`w-full py-4 px-6 rounded-xl text-white font-bold text-lg shadow-lg transition-all 
                  ${isLoading 
                    ? 'bg-indigo-400 cursor-not-allowed' 
                    : 'bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 hover:shadow-indigo-500/30 transform hover:-translate-y-0.5'
                  }`}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {files.length > 0 ? (config.language === 'vi' ? 'Đang đọc tài liệu và tạo đề...' : 'Reading files and generating...') : (config.language === 'vi' ? 'AI đang suy nghĩ và tạo đề...' : 'AI is generating the exam...')}
                  </span>
                ) : (config.language === 'vi' ? 'TẠO ĐỀ KIỂM TRA NGAY' : 'GENERATE EXAM NOW')}
              </button>
            </div>
          </div>
          
          {error && (
            <div className="mt-6 p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 text-sm flex items-start">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
               </svg>
               {error}
            </div>
          )}
        </div>

        {/* Right Column: Output Preview (Takes 7/12 columns) */}
        <div className="lg:col-span-7 bg-white rounded-2xl shadow-xl border border-slate-300 flex flex-col h-[800px] lg:h-auto overflow-hidden">
          {/* Header strictly white with simple border */}
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white sticky top-0 z-10">
            <div className="flex items-center space-x-2">
               <div className="bg-slate-100 p-1.5 rounded-md">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-600" viewBox="0 0 20 20" fill="currentColor">
                   <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                 </svg>
               </div>
               <span className="text-slate-800 font-bold text-sm ml-2">Kết quả (LaTeX Source)</span>
            </div>
            {generatedCode && (
              <button 
                onClick={copyToClipboard}
                className="text-xs bg-white hover:bg-slate-50 text-indigo-600 font-bold py-2 px-4 rounded-lg transition flex items-center border border-indigo-200 shadow-sm hover:shadow"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                {config.language === 'vi' ? 'Sao chép mã' : 'Copy Code'}
              </button>
            )}
          </div>
          <div className="flex-1 relative bg-white">
            {!generatedCode && !isLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-8 text-center bg-white">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 mb-4 opacity-10 text-slate-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                 </svg>
                 <p className="font-medium text-slate-500 text-lg">{config.language === 'vi' ? 'Mã LaTeX sẽ hiển thị tại đây.' : 'LaTeX code will appear here.'}</p>
                 <p className="text-slate-400 text-sm mt-2 max-w-xs">{config.language === 'vi' ? 'Hãy điền thông tin bên trái và bấm nút Tạo đề.' : 'Fill in the form on the left and click Generate.'}</p>
              </div>
            )}
            {isLoading && (
               <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 p-8 text-center bg-white">
                  <div className="w-full max-w-xs bg-slate-100 h-1.5 rounded-full overflow-hidden mb-4">
                     <div className="bg-indigo-600 h-full animate-progress-bar origin-left w-full"></div>
                  </div>
                  <p className="font-bold text-sm animate-pulse text-indigo-700">{config.language === 'vi' ? 'AI đang phân tích và soạn thảo đề thi...' : 'AI is analyzing and drafting the exam...'}</p>
                  <p className="text-xs text-slate-400 mt-2">{config.language === 'vi' ? 'Việc này có thể mất khoảng 30-60 giây.' : 'This may take 30-60 seconds.'}</p>
               </div>
            )}
            <textarea 
              className="w-full h-full bg-white text-slate-800 font-mono text-sm p-6 outline-none resize-none leading-relaxed border-0 focus:ring-0"
              readOnly
              value={generatedCode}
              spellCheck={false}
              placeholder="LaTeX code starts here..."
            />
          </div>
        </div>

      </main>

      {/* Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={closePreview}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-700 truncate pr-4">{previewFile.name}</h3>
              <button onClick={closePreview} className="text-slate-400 hover:text-slate-600 transition">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 bg-slate-100 p-4 overflow-auto flex justify-center items-center">
              {previewFile.type === 'image' ? (
                <img src={previewFile.url} alt="Preview" className="max-w-full max-h-full object-contain rounded shadow-lg" />
              ) : (
                <iframe src={previewFile.url} className="w-full h-full rounded shadow-lg border bg-white" title="PDF Preview"></iframe>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes progress-bar {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(0%); }
          100% { transform: translateX(100%); }
        }
        .animate-progress-bar {
          animation: progress-bar 1.5s infinite linear;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9; 
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1; 
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8; 
        }
      `}</style>
    </div>
  );
};

export default App;
