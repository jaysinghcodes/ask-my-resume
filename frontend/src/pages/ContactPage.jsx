import { Box, Typography, Button, Stack, Link } from "@mui/material";
import LinkedInIcon from "@mui/icons-material/LinkedIn";
import GitHubIcon from "@mui/icons-material/GitHub";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import { CONTACT_LINKS } from "../config/constants";

const CONTACT_ICONS = {
  LinkedIn: <LinkedInIcon />,
  GitHub: <GitHubIcon />,
  Email: <EmailOutlinedIcon />,
};

export function ContactPage() {
  return (
    <Box
      sx={{
        maxWidth: 560,
        width: "100%",
        mx: "auto",
        px: { xs: 1.5, sm: 2 },
        py: { xs: 3, sm: 4 },
        pt: { xs: 7, sm: 8 },
        pb: { xs: 4, sm: 5 },
        boxSizing: "border-box",
      }}
    >
      <Typography
        variant="h1"
        sx={{
          fontSize: { xs: 28, sm: 36 },
          mb: 1,
          "& span": { color: "primary.main" },
        }}
      >
        Get in <span>touch</span>
      </Typography>
      <Typography variant="body2" sx={{ mb: 2, color: "text.secondary" }}>
        Jagteshwar (Jay) Singh — Software Engineer. Ohio State CS · Class of
        2024. Recruiters, hiring managers, and anyone curious about working
        together — reach out anytime.
      </Typography>
      <Typography variant="body2" sx={{ mb: 4, color: "text.secondary" }}>
        LinkedIn · GitHub · Email below.
      </Typography>

      <Stack spacing={2}>
        {CONTACT_LINKS.map(({ label, href, description }) => (
          <Link
            key={label}
            href={href}
            target={href.startsWith("mailto:") ? undefined : "_blank"}
            rel={href.startsWith("mailto:") ? undefined : "noreferrer"}
            underline="none"
          >
            <Button
              fullWidth
              variant="outlined"
              startIcon={CONTACT_ICONS[label]}
              sx={{
                justifyContent: "flex-start",
                py: 2,
                px: { xs: 2, sm: 2.5 },
                minHeight: 44,
                borderColor: "divider",
                color: "text.primary",
                "&:hover": {
                  borderColor: "primary.main",
                  color: "primary.main",
                  bgcolor: "action.hover",
                },
              }}
            >
              <Box sx={{ textAlign: "left", flex: 1 }}>
                <Typography sx={{ fontWeight: 600, fontSize: 15 }}>
                  {label}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ color: "text.secondary", fontWeight: 400 }}
                >
                  {description}
                </Typography>
              </Box>
            </Button>
          </Link>
        ))}
      </Stack>

      <Typography variant="body2" sx={{ mt: 4, color: "text.secondary" }}>
        Based in Chicago, IL · Open to remote and relocation for the right
        role.
      </Typography>
    </Box>
  );
}
