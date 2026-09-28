#include <bits/stdc++.h>
using namespace std;
int main(){string s;cin>>s;vector<int>last(256,-1);int l=0,best=0;for(int r=0;r<(int)s.size();r++){unsigned char c=s[r];if(last[c]>=l)l=last[c]+1;last[c]=r;best=max(best,r-l+1);}cout<<best<<"\n";}
