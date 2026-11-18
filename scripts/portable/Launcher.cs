using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;

internal static class MoyeoPortable
{
    [STAThread]
    private static int Main(string[] args)
    {
        string root = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "MoyeoPortable"));
        string runtime = Path.GetFullPath(Path.Combine(root, Guid.NewGuid().ToString("N")));
        Form progress = null;
        try
        {
            Application.EnableVisualStyles();
            progress = new Form { Text = "모여 포터블", Width = 430, Height = 145,
                FormBorderStyle = FormBorderStyle.FixedDialog, StartPosition = FormStartPosition.CenterScreen,
                ControlBox = false, ShowInTaskbar = true };
            progress.Controls.Add(new Label { Text = "모여를 준비하고 있습니다…", Left = 24, Top = 22, Width = 370, Height = 25 });
            progress.Controls.Add(new ProgressBar { Left = 24, Top = 58, Width = 365, Height = 18,
                Style = ProgressBarStyle.Marquee, MarqueeAnimationSpeed = 30 });
            progress.Show();
            Application.DoEvents();
            Directory.CreateDirectory(runtime);
            string prefix = runtime + Path.DirectorySeparatorChar;
            using (Stream payload = Assembly.GetExecutingAssembly().GetManifestResourceStream("MoyeoPayload.zip"))
            {
                if (payload == null) throw new IOException("내장된 앱을 찾지 못했습니다.");
                using (ZipArchive archive = new ZipArchive(payload, ZipArchiveMode.Read, false))
                {
                    byte[] buffer = new byte[1024 * 1024];
                    foreach (ZipArchiveEntry entry in archive.Entries)
                    {
                        string destination = Path.GetFullPath(Path.Combine(runtime, entry.FullName.Replace('/', Path.DirectorySeparatorChar)));
                        if (!destination.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                            throw new IOException("올바르지 않은 앱 파일 경로입니다.");
                        if (((entry.ExternalAttributes >> 16) & 0xF000) == 0xA000)
                            throw new IOException("앱에 지원하지 않는 링크가 포함되어 있습니다.");
                        if (entry.FullName.EndsWith("/") || entry.FullName.EndsWith("\\"))
                        {
                            Directory.CreateDirectory(destination);
                            continue;
                        }
                        Directory.CreateDirectory(Path.GetDirectoryName(destination));
                        using (Stream source = entry.Open())
                        using (FileStream target = new FileStream(destination, FileMode.CreateNew, FileAccess.Write))
                        {
                            int read;
                            while ((read = source.Read(buffer, 0, buffer.Length)) != 0)
                            {
                                target.Write(buffer, 0, read);
                                Application.DoEvents();
                            }
                        }
                    }
                }
            }
            string[] executables = Directory.GetFiles(runtime, "Moyeo.exe", SearchOption.AllDirectories);
            if (executables.Length != 1) throw new IOException("실행할 앱을 찾지 못했습니다.");
            progress.Close();
            progress.Dispose();
            progress = null;
            ProcessStartInfo start = new ProcessStartInfo {
                FileName = executables[0], WorkingDirectory = Path.GetDirectoryName(executables[0]),
                Arguments = Arguments(args), UseShellExecute = false, CreateNoWindow = true,
                RedirectStandardOutput = true, RedirectStandardError = true
            };
            // Preserve inherited handles so standard Electron debugging tools also work.
            using (Process child = Process.Start(start))
            {
                System.Threading.Tasks.Task stdout = child.StandardOutput.BaseStream.CopyToAsync(Console.OpenStandardOutput());
                System.Threading.Tasks.Task stderr = child.StandardError.BaseStream.CopyToAsync(Console.OpenStandardError());
                child.WaitForExit();
                try { System.Threading.Tasks.Task.WaitAll(stdout, stderr); } catch (AggregateException) { }
                return child.ExitCode;
            }
        }
        catch (Exception error)
        {
            if (progress != null) progress.Close();
            MessageBox.Show("모여를 실행하지 못했습니다.\n\n" + error.Message,
                "모여 포터블", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
        finally
        {
            // Only remove the unique runtime directory created by this invocation.
            string checkedRoot = Path.GetFullPath(root) + Path.DirectorySeparatorChar;
            string checkedRuntime = Path.GetFullPath(runtime);
            Guid id;
            if (checkedRuntime.StartsWith(checkedRoot, StringComparison.OrdinalIgnoreCase)
                && String.Equals(Path.GetDirectoryName(checkedRuntime), Path.GetFullPath(root), StringComparison.OrdinalIgnoreCase)
                && Guid.TryParseExact(Path.GetFileName(checkedRuntime), "N", out id))
            {
                for (int attempt = 0; attempt < 8; attempt++)
                {
                    try { if (Directory.Exists(checkedRuntime)) Directory.Delete(checkedRuntime, true); break; }
                    catch (IOException) { Thread.Sleep(250); }
                    catch (UnauthorizedAccessException) { Thread.Sleep(250); }
                }
            }
        }
    }

    private static string Arguments(string[] args)
    {
        StringBuilder result = new StringBuilder();
        foreach (string arg in args)
        {
            if (result.Length > 0) result.Append(' ');
            result.Append('"');
            int slashes = 0;
            foreach (char c in arg)
            {
                if (c == '\\') { slashes++; continue; }
                if (c == '"') { result.Append('\\', slashes * 2 + 1); result.Append(c); }
                else { result.Append('\\', slashes); result.Append(c); }
                slashes = 0;
            }
            result.Append('\\', slashes * 2);
            result.Append('"');
        }
        return result.ToString();
    }
}
