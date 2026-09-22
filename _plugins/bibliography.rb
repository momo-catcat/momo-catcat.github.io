=begin
  Jekyll tag to embed a Zotero bibliography HTML export (File > Create Bibliography
  > Output Mode: Bibliography, Output Method: Save as HTML) into a page.
  Usage:
    {% bibliography assets/publications %}
  The argument is a path relative to the site root, either to an .html file or to a
  folder containing exactly one .html file. Only the <body> content is inserted, and
  markdown processing is disabled for it so titles are not mangled by kramdown.
=end
module Jekyll
  class BibliographyTag < Liquid::Tag
    def initialize(tag_name, text, tokens)
      super
      @path = text.strip
    end

    def render(context)
      site = context.registers[:site]
      path = File.join(site.source, @path)

      if File.directory?(path)
        files = Dir.glob(File.join(path, "*.html"))
        if files.length != 1
          raise ArgumentError, "bibliography: expected exactly one .html file in #{@path}, found #{files.length}"
        end
        path = files.first
      end

      html = File.read(path, encoding: "utf-8")
      body = html[%r{<body[^>]*>(.*)</body>}m, 1] || html
      body.sub(%r{<div class="csl-bib-body"}, '<div markdown="0" class="csl-bib-body"')
    end
  end
end

Liquid::Template.register_tag('bibliography', Jekyll::BibliographyTag)
