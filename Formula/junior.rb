class Junior < Formula
  desc "Command-line launcher for the RecruitPro baseball recruiting platform"
  homepage "https://github.com/jhostalek/recruit2pro"
  license "MIT"
  head "https://github.com/jhostalek/recruit2pro.git", branch: "main"

  def install
    bin.install "bin/junior"
  end

  test do
    assert_match "1.0.0", shell_output("#{bin}/junior version")
  end
end
